package grpc

import (
	"fmt"
	"log"
	"net"

	"github.com/WUSTL-Delivery/delivery-gdg-platform/main/apps/authoritative/internal/state"
	pb "github.com/WUSTL-Delivery/delivery-gdg-platform/main/apps/authoritative/proto"
	"google.golang.org/grpc"
)

// config for gRPC server / setup

// Server wraps the gRPC server and handlers
type Server struct {
	grpcServer   *grpc.Server
	robotHandler *RobotHandler
	stateManager *state.Manager
	port         int
}

// NewServer creates a new gRPC server
func NewServer(port int, stateManager *state.Manager) *Server {
	grpcServer := grpc.NewServer()

	// Create handlers
	robotHandler := NewRobotHandler(stateManager)

	// Register services
	pb.RegisterRobotServiceServer(grpcServer, robotHandler)

	return &Server{
		grpcServer:   grpcServer,
		robotHandler: robotHandler,
		stateManager: stateManager,
		port:         port,
	}
}

// Start starts the gRPC server
func (s *Server) Start() error {
	lis, err := net.Listen("tcp", fmt.Sprintf(":%d", s.port))
	if err != nil {
		return fmt.Errorf("failed to listen on port %d: %w", s.port, err)
	}

	log.Printf("gRPC server listening on port %d", s.port)

	if err := s.grpcServer.Serve(lis); err != nil {
		return fmt.Errorf("failed to serve: %w", err)
	}

	return nil
}

// Stop gracefully stops the gRPC server
func (s *Server) Stop() {
	log.Println("Shutting down gRPC server...")
	s.grpcServer.GracefulStop()
	log.Println("gRPC server stopped")
}
