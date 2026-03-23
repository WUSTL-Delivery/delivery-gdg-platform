package robots

import "github.com/WUSTL-Delivery/delivery-gdg-platform/main/apps/authoritative/internal/wsockets"

type RobotStage struct {
	robotID int
	client  *wsockets.Client
}
