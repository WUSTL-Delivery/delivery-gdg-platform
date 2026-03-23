package robotmanager

import (
	"log"
	"net/http"

	"github.com/WUSTL-Delivery/delivery-gdg-platform/main/apps/authoritative/internal/matcher"
	"github.com/WUSTL-Delivery/delivery-gdg-platform/main/apps/authoritative/internal/wsockets"
)

func StartRobotManager(orm *matcher.OrderRobotMatcher, match chan (*matcher.OrderRobotMatch)) {
	hub := wsockets.NewHub(orm, match)
	go hub.Run()

	http.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		wsockets.HandleWebSocket(hub, w, r)
	})

	addr := ":8080"

	log.Printf("websocket server starting at %s", addr)
	err := http.ListenAndServe(addr, nil)
	if err != nil {
		log.Fatal("Listen and Serve Failed", err)
	}
}
