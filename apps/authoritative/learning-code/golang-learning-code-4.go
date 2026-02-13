package main

import "fmt"

func helloName(name string) {
	fmt.Println("Hello, " + name)
}

func sum(array []int) int {
	sum := 0
	for i := range array {
		sum += array[i]
	}
	return sum
}

func factorial(num int) int {
	fact := 1
	for num > 0 {
		fact = fact * num
		num--
	}
	return fact
}

func main() {
	helloName("Sophie")
	testArray := []int{1, 3, 5}
	fmt.Println(sum(testArray))
	fmt.Println(factorial(4))
}
