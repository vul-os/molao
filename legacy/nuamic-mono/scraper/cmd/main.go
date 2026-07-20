package main

import (
	"bufio"
	"context"
	"log"
	"os"
	"os/signal"
	"strings"
	"sync"
	"syscall"

	"github.com/vbauerster/mpb/v8"
	"github.com/vbauerster/mpb/v8/decor"
)

// readCaseURLs reads and returns a slice of URLs from the specified file
func readCaseURLs(filename string) ([]string, error) {
	file, err := os.Open(filename)
	if err != nil {
		return nil, err
	}
	defer file.Close()

	var urls []string
	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		if url := strings.TrimSpace(scanner.Text()); url != "" {
			urls = append(urls, url)
		}
	}

	if err := scanner.Err(); err != nil {
		return nil, err
	}

	return urls, nil
}

// createProgressBar creates and configures a progress bar
func createProgressBar(p *mpb.Progress, total int) *mpb.Bar {
	return p.AddBar(int64(total),
		mpb.PrependDecorators(
			decor.Name("Processing RTFs: "),
			decor.Percentage(),
		),
		mpb.AppendDecorators(
			decor.Elapsed(decor.ET_STYLE_GO),
			decor.OnComplete(
				decor.Name("Done! "),
				"✔️",
			),
		),
	)
}

// setupGracefulShutdown sets up context cancellation on system signals
func setupGracefulShutdown() (context.Context, context.CancelFunc) {
	ctx, cancel := context.WithCancel(context.Background())
	go func() {
		sigChan := make(chan os.Signal, 1)
		signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)
		<-sigChan
		log.Println("\nInterrupt signal received. Shutting down gracefully...")
		cancel()
	}()
	return ctx, cancel
}

func main() {
	// Load configuration
	config, err := LoadConfig("config.json")
	if err != nil {
		log.Fatalf("Error loading config: %v", err)
	}

	// Initialize components
	uploader := NewBunnyCDNUploader(config.BunnyAPIKey, config.StorageZoneName, config.Region)
	proxyManager := NewProxyManager(config.ProxyConfig)
	if err := proxyManager.RefreshProxies(); err != nil {
		log.Printf("Warning: Failed to initialize proxy list: %v", err)
	}

	// Initialize Supabase client
	supabaseClient, err := initSupabaseClient(config)
	if err != nil {
		log.Fatalf("Failed to initialize Supabase client: %v", err)
	}

	// Read case URLs
	caseURLs, err := readCaseURLs(config.CaseURLsFile)
	if err != nil {
		log.Fatalf("Failed to read case URLs: %v", err)
	}

	totalCases := len(caseURLs)
	if totalCases == 0 {
		log.Fatalf("No case URLs found in '%s'", config.CaseURLsFile)
	}

	// Initialize progress bar
	p := mpb.New(mpb.WithWidth(60))
	bar := createProgressBar(p, totalCases)

	// Setup concurrency
	ctx, cancel := setupGracefulShutdown()
	defer cancel()

	sem := make(chan struct{}, config.Concurrency)
	var wg sync.WaitGroup

	for _, caseURL := range caseURLs {
		select {
		case <-ctx.Done():
			log.Println("Context canceled. Exiting main loop.")
			goto Cleanup
		default:
			wg.Add(1)
			sem <- struct{}{} // Acquire slot

			go func(cURL string) {
				defer wg.Done()
				defer func() { <-sem }() // Release slot

				if err := processCase(ctx, cURL, proxyManager, uploader, supabaseClient, config); err != nil {
					log.Printf("Error processing case %s: %v", cURL, err)
				}
				bar.Increment()
			}(caseURL)
		}
	}

Cleanup:
	wg.Wait()
	p.Wait()

	// Print final proxy statistics
	stats := proxyManager.GetProxyStats()
	log.Printf("Proxy Statistics: %+v\n", stats)
	log.Println("All RTF files have been processed.")
}
