package dispatch

import "testing"

func TestAddRobotAndGetStates(t *testing.T) {
	d := NewDispatcher()
	d.AddRobot("r1", 120) // clamps to 100
	d.AddRobot("r2", 10)

	states := d.GetRobotStates()
	if len(states) != 2 {
		t.Fatalf("expected 2 robots, got %d", len(states))
	}
	if states["r1"] != Idle || states["r2"] != Idle {
		t.Fatalf("expected all robots to be idle")
	}

	r1, err := d.GetRobotInfo("r1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if r1.BatteryLevel != 100 {
		t.Fatalf("expected clamped battery 100, got %d", r1.BatteryLevel)
	}
}

func TestAssignTaskSpecificRobot(t *testing.T) {
	d := NewDispatcher()
	d.AddRobot("r1", 70)
	d.AddRobot("r2", 90)

	order := Order{
		RecipientID:    "student-1",
		PickupLocation: Corner17,
		DropoffLocation: DUC,
	}

	assigned, err := d.AssignTask("r1", order)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if assigned != "r1" {
		t.Fatalf("expected r1, got %s", assigned)
	}

	r1, _ := d.GetRobotInfo("r1")
	if r1.State != Busy {
		t.Fatalf("expected r1 busy")
	}
	if r1.CurrentLocation != Corner17 || r1.DropoffLocation != DUC {
		t.Fatalf("task locations were not assigned correctly")
	}
}

func TestAssignTaskAutoChoosesBestBattery(t *testing.T) {
	d := NewDispatcher()
	d.AddRobot("r1", 55)
	d.AddRobot("r2", 95)

	assigned, err := d.AssignTask("", Order{
		RecipientID:    "student-2",
		PickupLocation: BeastCraft,
		DropoffLocation: MuddField,
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if assigned != "r2" {
		t.Fatalf("expected r2, got %s", assigned)
	}
}

func TestAssignTaskValidationAndBatteryThreshold(t *testing.T) {
	d := NewDispatcher()
	d.AddRobot("low", 10)

	_, err := d.AssignTask("low", Order{
		RecipientID:    "student-3",
		PickupLocation: Corner17,
		DropoffLocation: DUC,
	})
	if err == nil {
		t.Fatalf("expected insufficient battery error")
	}

	_, err = d.AssignTask("", Order{
		RecipientID:    "",
		PickupLocation: Corner17,
		DropoffLocation: DUC,
	})
	if err == nil {
		t.Fatalf("expected recipient validation error")
	}

	_, err = d.AssignTask("", Order{
		RecipientID:    "student-4",
		PickupLocation: InTransit,
		DropoffLocation: DUC,
	})
	if err == nil {
		t.Fatalf("expected location validation error")
	}
}

func TestUpdateAndRemoveRobot(t *testing.T) {
	d := NewDispatcher()
	d.AddRobot("r1", 50)

	if err := d.UpdateRobotState("r1", Charging); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	r, err := d.GetRobotInfo("r1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if r.State != Charging {
		t.Fatalf("expected charging, got %v", r.State)
	}

	if err := d.RemoveRobot("r1"); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if _, err := d.GetRobotInfo("r1"); err == nil {
		t.Fatalf("expected not found after remove")
	}
}

func TestUpdateRobotTask(t *testing.T) {
	d := NewDispatcher()
	d.AddRobot("r1", 85)

	err := d.UpdateRobotTask("r1", Order{
		RecipientID:    "student-5",
		PickupLocation: DUC,
		DropoffLocation: Corner17,
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	r, _ := d.GetRobotInfo("r1")
	if r.RecipientID != "student-5" || r.PickupLocation != DUC || r.DropoffLocation != Corner17 {
		t.Fatalf("task update did not persist")
	}
}
