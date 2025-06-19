package main

import (
	"bufio"
	"fmt"
	"log"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/gocolly/colly"
	"github.com/vbauerster/mpb/v8"
	"github.com/vbauerster/mpb/v8/decor"
)

const (
	BASE_URL = "https://www.saflii.org"
)

// isValidHref checks if the href is valid (does not contain unwanted substrings)
func isValidHref(href string) bool {
	lowerHref := strings.ToLower(href)
	unwantedSubstrings := []string{
		"donate.html",
		"databases.html",
		"toc-",
	}

	for _, substr := range unwantedSubstrings {
		if strings.Contains(lowerHref, substr) {
			return false
		}
	}
	return true
}

// isValidDatabaseURL checks if the href is a valid database URL
func isValidDatabaseURL(href string) bool {
	// Check if it's a South African database URL
	if strings.HasPrefix(href, "/za/") {
		// Check if it's one of the valid categories
		return strings.Contains(href, "/cases/") || 
			   strings.Contains(href, "/journals/") || 
			   strings.Contains(href, "/other/") ||
			   strings.Contains(href, "/gaz/")
	}
	
	// Check for other African database URLs
	if strings.Contains(href, "/ao/") || strings.Contains(href, "/bw/") || 
	   strings.Contains(href, "/ea/") || strings.Contains(href, "/mg/") ||
	   strings.Contains(href, "/mu/") || strings.Contains(href, "/mz/") ||
	   strings.Contains(href, "/sa/") {
		return true
	}
	
	return false
}

// Step 1: Collect and cache base URLs
func collectBaseURLs() (string, error) {
	today := time.Now().Format("2006-01-02")
	filename := fmt.Sprintf("base_urls_%s.txt", today)

	// Check if we already have today's file
	if _, err := os.Stat(filename); err == nil {
		log.Printf("Using existing base URLs from %s", filename)
		return filename, nil
	}

	// Create new file for today
	file, err := os.Create(filename)
	if err != nil {
		return "", fmt.Errorf("failed to create file: %v", err)
	}
	defer file.Close()

	writer := bufio.NewWriter(file)
	defer writer.Flush()

	// Initialize a collector with both saflii.org and www.saflii.org
	c := colly.NewCollector(
		colly.AllowedDomains("saflii.org", "www.saflii.org"),
	)
	c.UserAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
		"AppleWebKit/537.36 (KHTML, like Gecko) " +
		"Chrome/91.0.4472.124 Safari/537.36"
	c.IgnoreRobotsTxt = true // Consider setting to false for ethical scraping

	// Optional: Add logging to verify requests
	c.OnRequest(func(r *colly.Request) {
		log.Printf("Visiting: %s", r.URL.String())
	})

	c.OnError(func(r *colly.Response, err error) {
		log.Printf("Error: %v while visiting %s", err, r.Request.URL)
	})

	urlMap := make(map[string]bool) // For deduplication

	// Initialize a simple progress bar since it's a single page
	bar := mpb.New(mpb.WithWidth(60))
	barTotal := 1
	progressBar := bar.AddBar(int64(barTotal),
		mpb.PrependDecorators(
			decor.Name("Collecting Base URLs: "),
			decor.Percentage(),
		),
		mpb.AppendDecorators(
			decor.Elapsed(decor.ET_STYLE_GO),
		),
	)

	// Collect base URLs
	c.OnHTML("a[href]", func(e *colly.HTMLElement) {
		href := e.Attr("href")
		if !isValidHref(href) {
			return
		}
		
		// Use the new database URL validation
		if isValidDatabaseURL(href) {
			absoluteURL := e.Request.AbsoluteURL(href)
			absoluteURL = strings.TrimSuffix(absoluteURL, "/")

			if !urlMap[absoluteURL] {
				urlMap[absoluteURL] = true
				_, err := writer.WriteString(absoluteURL + "\n")
				if err != nil {
					log.Printf("Error writing URL: %v", err)
				}
			}
		}
	})

	log.Printf("Collecting base URLs from %s/content/databases.html", BASE_URL)
	err = c.Visit(BASE_URL + "/content/databases.html")
	if err != nil {
		return "", fmt.Errorf("failed to visit base page: %v", err)
	}

	// Mark the progress bar as complete
	progressBar.IncrBy(1)
	bar.Wait()

	log.Printf("Saved base URLs to %s", filename)
	return filename, nil
}

// Step 2: Process each base URL to get case URLs
func collectCaseURLs(baseFileName string) (string, error) {
	today := time.Now().Format("2006-01-02")
	caseFileName := fmt.Sprintf("case_urls_%s.txt", today)

	// Check if base URLs file exists
	baseFile, err := os.Open(baseFileName)
	if err != nil {
		return "", fmt.Errorf("base URLs file not found: %v", err)
	}
	defer baseFile.Close()

	// Create/open case URLs file
	caseFile, err := os.Create(caseFileName)
	if err != nil {
		return "", fmt.Errorf("failed to create case URLs file: %v", err)
	}
	defer caseFile.Close()

	writer := bufio.NewWriter(caseFile)
	defer writer.Flush()

	// Read all base URLs into a slice to determine the total count
	var baseURLs []string
	scanner := bufio.NewScanner(baseFile)
	for scanner.Scan() {
		baseURLs = append(baseURLs, scanner.Text())
	}
	if err := scanner.Err(); err != nil {
		return "", fmt.Errorf("error reading base URLs: %v", err)
	}

	totalBaseURLs := len(baseURLs)
	if totalBaseURLs == 0 {
		return "", fmt.Errorf("no base URLs found in %s", baseFileName)
	}

	// Initialize the progress bar
	p := mpb.New(mpb.WithWidth(60))
	baseBar := p.AddBar(int64(totalBaseURLs),
		mpb.PrependDecorators(
			decor.Name("Processing Base URLs: "),
			decor.CountersNoUnit("%d / %d"),
		),
		mpb.AppendDecorators(
			decor.Percentage(),
			decor.Elapsed(decor.ET_STYLE_GO),
		),
	)

	// Initialize a mutex for thread-safe writing
	var mu sync.Mutex

	// Initialize a wait group to wait for all goroutines to finish
	var wg sync.WaitGroup

	// Channel to limit the number of concurrent goroutines (e.g., 5 concurrent workers)
	concurrency := 5
	sem := make(chan struct{}, concurrency)

	// Initialize a collector
	c := colly.NewCollector(
		colly.AllowedDomains("www.saflii.org", "saflii.org"),
	)
	c.IgnoreRobotsTxt = true

	// Map to keep track of processed year URLs to avoid duplication
	var globalYearMap sync.Map

	// Map to keep track of written case URLs to ensure uniqueness
	var caseURLMap sync.Map

	for _, baseURL := range baseURLs {
		wg.Add(1)
		sem <- struct{}{} // Acquire a slot

		go func(baseURL string) {
			defer wg.Done()
			defer func() { <-sem }() // Release the slot

			// Clone the collector for thread safety
			yearCollector := c.Clone()

			// Collect case URLs from year pages
			yearCollector.OnHTML("a[href]", func(e *colly.HTMLElement) {
				href := e.Attr("href")
				if !isValidHref(href) {
					return
				}
				
				// Check for year directories (e.g., "2015/")
				if strings.HasPrefix(href, "20") && strings.HasSuffix(href, "/") {
					yearURL := e.Request.AbsoluteURL(href)

					// Check if this year URL has already been processed globally
					if _, loaded := globalYearMap.LoadOrStore(yearURL, true); !loaded {
						// Visit the year page to collect case URLs
						err := yearCollector.Visit(yearURL)
						if err != nil {
							log.Printf("Error visiting year URL %s: %v", yearURL, err)
						}
					}
				}

				// Collect case URLs - look for .html files that are not toc- files
				if strings.HasSuffix(strings.ToLower(href), ".html") {
					fullURL := e.Request.AbsoluteURL(href)
					
					// Skip unwanted HTML files
					if strings.Contains(strings.ToLower(fullURL), "toc-") {
						return
					}

					// Ensure the case URL is unique
					_, loaded := caseURLMap.LoadOrStore(fullURL, true)
					if !loaded {
						mu.Lock()
						_, err := writer.WriteString(fullURL + "\n")
						if err != nil {
							log.Printf("Error writing case URL: %v", err)
						}
						mu.Unlock()
					}
				}
			})

			// Visit the base URL
			err := yearCollector.Visit(baseURL)
			if err != nil {
				log.Printf("Error visiting base URL %s: %v", baseURL, err)
			}

			// Increment the base URLs progress bar
			baseBar.Increment()
		}(baseURL)
	}

	// Wait for all goroutines to finish
	wg.Wait()
	// Wait for the progress bar to complete rendering
	p.Wait()

	log.Printf("Saved case URLs to %s", caseFileName)
	return caseFileName, nil
}

func main() {
	// Step 1: Collect base URLs (if not already done today)
	baseFileName, err := collectBaseURLs()
	if err != nil {
		log.Fatalf("Failed to collect base URLs: %v", err)
	}

	// Step 2: Process each base URL to get case URLs
	caseFileName, err := collectCaseURLs(baseFileName)
	if err != nil {
		log.Fatalf("Failed to collect case URLs: %v", err)
	}

	log.Printf("Process completed successfully. Case URLs saved to %s", caseFileName)
}
