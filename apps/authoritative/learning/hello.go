package main

import "fmt"

func main() {
	var name string
	fmt.Print("Enter your name: ")
	fmt.Scanln(&name)
	sayHello(name)
}

func sayHello(name string) {
	fmt.Println("hello", name)
}
