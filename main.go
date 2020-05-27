package main

import (
	"log"
	"os"

	"github.com/gorilla/websocket"
	"github.com/labstack/echo"
	"github.com/labstack/echo/middleware"
)

var (
	upgrader = websocket.Upgrader{}
	conns    = map[string][]*websocket.Conn{}
)

// Message struct
type Message struct {
	Message string `json:"message"`
}

func main() {
	var path string
	if len(os.Args) > 1 {
		path = os.Args[1]
	}
	e := echo.New()
	e.Use(middleware.Logger())
	e.Use(middleware.Recover())
	g := e.Group(path)
	g.Static("/", "html")
	g.GET("/ws/:id", websocketHandler)

	e.HideBanner = true
	//e.Start(":8769")
	e.StartTLS(":8769", "ssl/server.crt", "ssl/server.key")
}

func websocketHandler(c echo.Context) error {
	id := c.Param("id")
	ws, err := upgrader.Upgrade(c.Response(), c.Request(), nil)
	if err != nil {
		return err
	}
	if _, ok := conns[id]; !ok {
		conns[id] = make([]*websocket.Conn, 0)
	}

	conns[id] = append(conns[id], ws)
	defer func() {
		remove(conns[id], ws)
		ws.Close()
		if len(conns[id]) == 0 {
			delete(conns, id)
		}
	}()

	for {
		// Read
		_, msg, err := ws.ReadMessage()
		if err != nil {
			c.Logger().Error(err)
			break
		}
		broadcastRaw(ws, conns[id], msg)
	}
	return nil
}

func broadcastRaw(sender *websocket.Conn, list []*websocket.Conn, b []byte) {
	log.Printf("%s\n", b)
	for _, ws := range list {
		if sender == ws {
			// not send message to sender
			continue
		}
		err := ws.WriteMessage(websocket.TextMessage, b)
		if err != nil {
			log.Println(err)
		}
	}
}

func remove(slices []*websocket.Conn, search *websocket.Conn) []*websocket.Conn {
	var result []*websocket.Conn
	for i, v := range slices {
		if v == search {
			s := append(slices[:i], slices[i+1:]...)
			result = make([]*websocket.Conn, len(s))
			copy(result, s)
			break
		}
	}
	return result
}
