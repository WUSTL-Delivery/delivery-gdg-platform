package grpc

import (
	"context"
	"fmt"

	"github.com/WUSTL-Delivery/delivery-gdg-platform/main/apps/authoritative/internal/matcher"
	db "github.com/WUSTL-Delivery/delivery-gdg-platform/main/apps/authoritative/pkg"
	pb "github.com/WUSTL-Delivery/delivery-gdg-platform/main/apps/authoritative/proto"
)

type OrderHandler struct {
	pb.UnimplementedOrderHandlerServer
	db  *db.Database
	orm *matcher.OrderRobotMatcher
}

func NewOrderHandler(database *db.Database, orm *matcher.OrderRobotMatcher) *OrderHandler {
	return &OrderHandler{
		db:  database,
		orm: orm,
	}
}

func (h *OrderHandler) InsertOrder(ctx context.Context, req *pb.InsertOrderRequest) (*pb.InsertOrderResponse, error) {
	incomingOrder := req.GetOrder()
	if incomingOrder == nil {
		return nil, fmt.Errorf("missing order in request")
	}

	var dbItems []db.OrderItem
	for _, item := range incomingOrder.Items {
		dbItems = append(dbItems, db.OrderItem{
			ItemName: item.ItemName,
			Quantity: int(item.Quantity),
			Price:    float64(item.Price),
		})
	}

	newOrder := &db.Order{
		UserID:          incomingOrder.UserId,
		VendorID:        incomingOrder.VendorId,
		Status:          incomingOrder.Status,
		DropOffLocation: incomingOrder.DropoffLocId,
		OrderItems:      dbItems,
	}

	err := h.db.CreateOrder(ctx, newOrder)
	if err != nil {
		return nil, fmt.Errorf("failed to create order in db: %w", err)
	}

	order_element := matcher.CreateOrder(incomingOrder.UserId, int(newOrder.ID), 0)
	h.orm.SubmitOrder(order_element)

	incomingOrder.OrderId = newOrder.ID

	return &pb.InsertOrderResponse{
		Order:     incomingOrder,
		ReturnMsg: "Successfully created order in Supabase",
	}, nil
}
