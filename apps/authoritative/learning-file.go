package main

import "fmt"

// take in string and print Hello string
func hello(str string) {
	fmt.Println("Hello " + str)
}

func sum(arr []int) (sum int) {
	for i := range len(arr) {
		sum += arr[i]
	}

	return
}

func factorial(n int) int {
	if n == 1 {
		return 1
	}

	return n * factorial(n-1)
}

func main() {
	//problem 1
	hello("Gog")

	//problem 2
	arr := []int{56, 64, 24, 24, 43, 64}
	fmt.Println(sum(arr))

	//problem 3
	fmt.Println(factorial(10))
}
