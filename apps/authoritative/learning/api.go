package main

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

func main() {
	router := gin.Default() //makes router, handles requests

	//Post request
	router.POST("/add", func(c *gin.Context) {
		//Make a container to define data we expect
		var body struct {
			X float64 `json:"x"` //expect # called x
			Y float64 `json:"y"` //expect # called y
		}

		if err := c.BindJSON(&body); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid JSON"})
			return
		}

		//do the adding
		result := body.X + body.Y

		//send back
		c.JSON(http.StatusOK, gin.H{"result": result})

	})

	// Get request for add

	router.GET("/add", func(c *gin.Context) {
		//red x and y from URL
		xStr := c.Query("x")
		yStr := c.Query("y")

		//convert text to #'s
		x, err1 := strconv.ParseFloat(xStr, 64)
		y, err2 := strconv.ParseFloat(yStr, 64)
		if err1 != nil || err2 != nil {
			//error
			c.JSON(http.StatusBadRequest, gin.H{"error": "x and y must be numbers"})
			return

		}
		result := x + y

		//send result back as JSON
		c.sJSON(http.StatusOK, gin.H{"result": result})
	})

	router.Run(":8080")

}
