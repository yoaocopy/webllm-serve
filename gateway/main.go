package gateway

import (
	"bufio"
	"bytes"
	"crypto/sha1"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"log"
	"math/rand"
	"net"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"
)

type Gateway struct {
	mu          sync.Mutex
	bridge      *WSConn
	pending     map[string]chan BridgeMessage
	models      []string
	loadedModel string
}

type BridgeMessage struct {
	Type          string          `json:"type"`
	ID            string          `json:"id,omitempty"`
	Models        []string        `json:"models,omitempty"`
	LoadedModel   string          `json:"loadedModel,omitempty"`
	SelectedModel string          `json:"selectedModel,omitempty"`
	Request       json.RawMessage `json:"request,omitempty"`
	Response      json.RawMessage `json:"response,omitempty"`
	Chunk         json.RawMessage `json:"chunk,omitempty"`
	Error         *BridgeError    `json:"error,omitempty"`
}

type BridgeError struct {
	Message string `json:"message"`
}

type WSConn struct {
	conn net.Conn
	rw   *bufio.ReadWriter
	mu   sync.Mutex
}

var DefaultStaticMode = "local"

func Run(staticFiles http.FileSystem) {
	addr := flag.String("addr", "", "gateway listen address. If empty, starts at 127.0.0.1:21434 and searches upward")
	staticMode := flag.String("static", DefaultStaticMode, "static file mode: local or embedded")
	devStatic := flag.Bool("dev-static", false, "deprecated alias for -static local")
	flag.Parse()

	listener, listenAddr, err := chooseListener(*addr)
	if err != nil {
		log.Fatal(err)
	}
	defer listener.Close()

	gw := &Gateway{pending: make(map[string]chan BridgeMessage)}
	mux := http.NewServeMux()
	mux.HandleFunc("/bridge", gw.handleBridge)
	mux.HandleFunc("/health", gw.handleHealth)
	mux.HandleFunc("/v1/models", gw.handleModels)
	mux.HandleFunc("/v1/chat/completions", gw.handleChatCompletions)
	if *devStatic {
		*staticMode = "local"
	}
	switch *staticMode {
	case "local":
		staticFiles = http.Dir(".")
	case "embedded":
		if staticFiles == nil {
			log.Fatal("embedded static files are not available in this build")
		}
	default:
		log.Fatalf("invalid -static value %q; use local or embedded", *staticMode)
	}
	mux.Handle("/", staticHandler(staticFiles))

	server := &http.Server{
		Handler:           cors(mux),
		ReadHeaderTimeout: 10 * time.Second,
	}

	if err := writeGatewayConfig(listenAddr); err != nil {
		log.Printf("failed to write gateway config: %v", err)
	}

	printStartupSummary(listenAddr)
	log.Fatal(server.Serve(listener))
}

func staticHandler(staticFiles http.FileSystem) http.Handler {
	fileServer := http.FileServer(staticFiles)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/webllm-gateway-config.json" {
			http.ServeFile(w, r, "webllm-gateway-config.json")
			return
		}
		fileServer.ServeHTTP(w, r)
	})
}

func chooseListener(explicitAddr string) (net.Listener, string, error) {
	if explicitAddr != "" {
		listener, err := net.Listen("tcp", explicitAddr)
		return listener, explicitAddr, err
	}

	const host = "127.0.0.1"
	for port := 21434; port <= 21534; port++ {
		addr := net.JoinHostPort(host, strconv.Itoa(port))
		listener, err := net.Listen("tcp", addr)
		if err == nil {
			return listener, addr, nil
		}
	}

	return nil, "", errors.New("no available gateway port found in range 21434-21534")
}

func writeGatewayConfig(addr string) error {
	config := map[string]string{
		"addr":     addr,
		"base_url": "http://" + addr + "/v1",
		"bridge":   "ws://" + addr + "/bridge",
	}
	data, err := json.MarshalIndent(config, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile("webllm-gateway-config.json", data, 0644)
}

func printStartupSummary(addr string) {
	line := strings.Repeat("=", 72)
	log.Println(line)
	log.Println("WebLLM Serve gateway started")
	log.Printf("Listening:   http://%s", addr)
	log.Printf("Home:        http://%s/", addr)
	log.Printf("Server UI:   http://%s/server.html", addr)
	log.Printf("Client UI:   http://%s/client.html", addr)
	log.Printf("OpenAI API:  http://%s/v1", addr)
	log.Printf("Bridge WS:   ws://%s/bridge", addr)
	log.Println("")
	log.Println("Next steps:")
	log.Println("  1. Open the Home or Server UI URL above.")
	log.Println("  2. Load a WebLLM model in server.html.")
	log.Println("  3. Open the Client UI or call the OpenAI-compatible API.")
	log.Println("")
	log.Println("If the default port is busy, the gateway selects a higher port.")
	log.Println("Use the URLs printed here as the source of truth.")
	log.Println(line)
}

func cors(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "content-type, authorization")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (g *Gateway) handleHealth(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	g.mu.Lock()
	connected := g.bridge != nil
	loaded := g.loadedModel
	models := append([]string(nil), g.models...)
	g.mu.Unlock()

	writeJSON(w, map[string]any{
		"ok":               true,
		"bridge_connected": connected,
		"loaded_model":     loaded,
		"models":           models,
	})
}

func (g *Gateway) handleModels(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	g.mu.Lock()
	models := append([]string(nil), g.models...)
	g.mu.Unlock()

	data := make([]map[string]string, 0, len(models))
	for index, model := range models {
		alias := fmt.Sprintf("m%03d", index)
		if index == 0 {
			alias = "default"
		}
		data = append(data, map[string]string{
			"id":       model,
			"object":   "model",
			"owned_by": "webllm",
			"alias":    alias,
		})
	}

	writeJSON(w, map[string]any{
		"object": "list",
		"data":   data,
	})
}

func (g *Gateway) handleChatCompletions(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	body, err := io.ReadAll(io.LimitReader(r.Body, 8<<20))
	if err != nil {
		writeOpenAIError(w, err.Error(), http.StatusBadRequest)
		return
	}
	defer r.Body.Close()

	var req map[string]any
	if err := json.Unmarshal(body, &req); err != nil {
		writeOpenAIError(w, err.Error(), http.StatusBadRequest)
		return
	}

	id := "chatcmpl-local-" + strconv.FormatInt(time.Now().UnixNano(), 36) + "-" + strconv.Itoa(rand.Intn(100000))
	ch := make(chan BridgeMessage, 64)
	if !g.registerPending(id, ch) {
		writeOpenAIError(w, "server.html is not connected to the gateway", http.StatusServiceUnavailable)
		return
	}
	defer g.unregisterPending(id)

	msg := map[string]any{
		"type":    "gateway.chat.completions",
		"id":      id,
		"request": req,
	}
	if err := g.sendToBridge(msg); err != nil {
		writeOpenAIError(w, err.Error(), http.StatusServiceUnavailable)
		return
	}

	if stream, _ := req["stream"].(bool); stream {
		g.streamResponse(w, ch)
		return
	}

	select {
	case msg := <-ch:
		if msg.Type == "gateway.response" {
			w.Header().Set("Content-Type", "application/json")
			w.Write(msg.Response)
			return
		}
		if msg.Type == "gateway.error" {
			writeOpenAIError(w, msg.errorMessage(), http.StatusBadGateway)
			return
		}
		writeOpenAIError(w, "unexpected bridge response: "+msg.Type, http.StatusBadGateway)
	case <-time.After(10 * time.Minute):
		writeOpenAIError(w, "timed out waiting for WebLLM response", http.StatusGatewayTimeout)
	}
}

func (g *Gateway) streamResponse(w http.ResponseWriter, ch <-chan BridgeMessage) {
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")

	flusher, _ := w.(http.Flusher)
	for {
		select {
		case msg := <-ch:
			switch msg.Type {
			case "gateway.stream":
				fmt.Fprintf(w, "data: %s\n\n", msg.Chunk)
				if flusher != nil {
					flusher.Flush()
				}
			case "gateway.done":
				fmt.Fprint(w, "data: [DONE]\n\n")
				if flusher != nil {
					flusher.Flush()
				}
				return
			case "gateway.response":
				fmt.Fprintf(w, "data: %s\n\n", msg.Response)
				fmt.Fprint(w, "data: [DONE]\n\n")
				if flusher != nil {
					flusher.Flush()
				}
				return
			case "gateway.error":
				errPayload, _ := json.Marshal(map[string]any{
					"error": map[string]string{
						"message": msg.errorMessage(),
						"type":    "webllm_gateway_error",
						"code":    "webllm_bridge_error",
					},
				})
				fmt.Fprintf(w, "data: %s\n\n", errPayload)
				fmt.Fprint(w, "data: [DONE]\n\n")
				if flusher != nil {
					flusher.Flush()
				}
				return
			}
		case <-time.After(30 * time.Minute):
			fmt.Fprint(w, "data: [DONE]\n\n")
			if flusher != nil {
				flusher.Flush()
			}
			return
		}
	}
}

func (m BridgeMessage) errorMessage() string {
	if m.Error != nil && m.Error.Message != "" {
		return m.Error.Message
	}
	return "WebLLM bridge error"
}

func (g *Gateway) registerPending(id string, ch chan BridgeMessage) bool {
	g.mu.Lock()
	defer g.mu.Unlock()
	if g.bridge == nil {
		return false
	}
	g.pending[id] = ch
	return true
}

func (g *Gateway) unregisterPending(id string) {
	g.mu.Lock()
	delete(g.pending, id)
	g.mu.Unlock()
}

func (g *Gateway) sendToBridge(v any) error {
	g.mu.Lock()
	bridge := g.bridge
	g.mu.Unlock()
	if bridge == nil {
		return errors.New("server.html is not connected to the gateway")
	}
	return bridge.WriteJSON(v)
}

func (g *Gateway) handleBridge(w http.ResponseWriter, r *http.Request) {
	if strings.ToLower(r.Header.Get("Upgrade")) != "websocket" {
		http.Error(w, "expected websocket upgrade", http.StatusBadRequest)
		return
	}

	ws, err := upgradeWebSocket(w, r)
	if err != nil {
		log.Printf("websocket upgrade failed: %v", err)
		return
	}
	defer ws.Close()

	g.mu.Lock()
	g.bridge = ws
	g.mu.Unlock()
	log.Printf("server.html bridge connected from %s", r.RemoteAddr)

	_ = ws.WriteJSON(map[string]any{"type": "gateway.hello"})

	for {
		payload, err := ws.ReadText()
		if err != nil {
			log.Printf("server.html bridge disconnected: %v", err)
			g.mu.Lock()
			if g.bridge == ws {
				g.bridge = nil
				g.loadedModel = ""
			}
			g.mu.Unlock()
			return
		}

		var msg BridgeMessage
		if err := json.Unmarshal(payload, &msg); err != nil {
			log.Printf("invalid bridge message: %v", err)
			continue
		}
		g.handleBridgeMessage(msg)
	}
}

func (g *Gateway) handleBridgeMessage(msg BridgeMessage) {
	if msg.Type == "server.ready" || msg.Type == "gateway.status" {
		g.mu.Lock()
		g.models = append([]string(nil), msg.Models...)
		g.loadedModel = msg.LoadedModel
		g.mu.Unlock()
		return
	}

	if msg.ID == "" {
		return
	}

	g.mu.Lock()
	ch := g.pending[msg.ID]
	g.mu.Unlock()
	if ch == nil {
		return
	}

	select {
	case ch <- msg:
	default:
		log.Printf("dropping bridge message for %s: pending channel full", msg.ID)
	}
}

func upgradeWebSocket(w http.ResponseWriter, r *http.Request) (*WSConn, error) {
	key := r.Header.Get("Sec-WebSocket-Key")
	if key == "" {
		http.Error(w, "missing Sec-WebSocket-Key", http.StatusBadRequest)
		return nil, errors.New("missing Sec-WebSocket-Key")
	}

	hijacker, ok := w.(http.Hijacker)
	if !ok {
		http.Error(w, "websocket hijacking unsupported", http.StatusInternalServerError)
		return nil, errors.New("hijacking unsupported")
	}

	conn, rw, err := hijacker.Hijack()
	if err != nil {
		return nil, err
	}

	accept := websocketAccept(key)
	response := "HTTP/1.1 101 Switching Protocols\r\n" +
		"Upgrade: websocket\r\n" +
		"Connection: Upgrade\r\n" +
		"Sec-WebSocket-Accept: " + accept + "\r\n\r\n"
	if _, err := rw.WriteString(response); err != nil {
		conn.Close()
		return nil, err
	}
	if err := rw.Flush(); err != nil {
		conn.Close()
		return nil, err
	}

	return &WSConn{conn: conn, rw: rw}, nil
}

func websocketAccept(key string) string {
	sum := sha1.Sum([]byte(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"))
	return base64.StdEncoding.EncodeToString(sum[:])
}

func (ws *WSConn) Close() error {
	return ws.conn.Close()
}

func (ws *WSConn) WriteJSON(v any) error {
	data, err := json.Marshal(v)
	if err != nil {
		return err
	}
	return ws.WriteText(data)
}

func (ws *WSConn) WriteText(payload []byte) error {
	ws.mu.Lock()
	defer ws.mu.Unlock()

	var frame bytes.Buffer
	frame.WriteByte(0x81)
	n := len(payload)
	switch {
	case n < 126:
		frame.WriteByte(byte(n))
	case n <= 65535:
		frame.WriteByte(126)
		binary.Write(&frame, binary.BigEndian, uint16(n))
	default:
		frame.WriteByte(127)
		binary.Write(&frame, binary.BigEndian, uint64(n))
	}
	frame.Write(payload)
	_, err := ws.rw.Write(frame.Bytes())
	if err != nil {
		return err
	}
	return ws.rw.Flush()
}

func (ws *WSConn) ReadText() ([]byte, error) {
	header := make([]byte, 2)
	if _, err := io.ReadFull(ws.rw, header); err != nil {
		return nil, err
	}

	opcode := header[0] & 0x0f
	masked := header[1]&0x80 != 0
	length := uint64(header[1] & 0x7f)
	switch length {
	case 126:
		var n uint16
		if err := binary.Read(ws.rw, binary.BigEndian, &n); err != nil {
			return nil, err
		}
		length = uint64(n)
	case 127:
		if err := binary.Read(ws.rw, binary.BigEndian, &length); err != nil {
			return nil, err
		}
	}

	var mask [4]byte
	if masked {
		if _, err := io.ReadFull(ws.rw, mask[:]); err != nil {
			return nil, err
		}
	}

	payload := make([]byte, length)
	if _, err := io.ReadFull(ws.rw, payload); err != nil {
		return nil, err
	}
	if masked {
		for i := range payload {
			payload[i] ^= mask[i%4]
		}
	}

	switch opcode {
	case 0x1:
		return payload, nil
	case 0x8:
		return nil, io.EOF
	case 0x9:
		_ = ws.writeControl(0xA, payload)
		return ws.ReadText()
	default:
		return nil, fmt.Errorf("unsupported websocket opcode %d", opcode)
	}
}

func (ws *WSConn) writeControl(opcode byte, payload []byte) error {
	ws.mu.Lock()
	defer ws.mu.Unlock()
	if len(payload) > 125 {
		payload = payload[:125]
	}
	frame := []byte{0x80 | opcode, byte(len(payload))}
	frame = append(frame, payload...)
	_, err := ws.rw.Write(frame)
	if err != nil {
		return err
	}
	return ws.rw.Flush()
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(v)
}

func writeOpenAIError(w http.ResponseWriter, message string, status int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(map[string]any{
		"error": map[string]any{
			"message": message,
			"type":    "webllm_gateway_error",
			"code":    "webllm_gateway_error",
		},
	})
}
