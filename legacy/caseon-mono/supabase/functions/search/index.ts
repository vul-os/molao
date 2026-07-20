import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface SearchRequest {
  query: string
  firm_id?: string
}

interface ModalSearchResult {
  id: string
  file_name: string
  file_type: string
  score: number
  file_size?: number
  mime_type?: string
}

interface ModalSearchResponse {
  results: ModalSearchResult[]
  total: number
}

interface FileResult {
  id: string
  file_name: string
  file_title: string
  pdf_url: string
  file_size?: number
  summaries?: Array<{
    model: string
    content: string
  }>
}

interface UsageData {
  can_query: boolean
  daily_usage: number
  monthly_usage: number
  daily_limit: number
  monthly_limit: number
  daily_remaining: number
  monthly_remaining: number
  plan_name: string
}

interface SearchResponse {
  results: FileResult[]
  total: number
  query: string
  usage: UsageData
}

interface TursoFile {
  id: string
  file_name: string
  file_title?: string
  cdn_path: string
  file_size?: number
  summary?: string  // JSON string
}

// Turso HTTP API client
class TursoClient {
  private baseUrl: string
  private authToken: string

  constructor(url: string, authToken: string) {
    this.baseUrl = url.replace('libsql://', 'https://').replace(':443', '')
    this.authToken = authToken
  }

  async execute(sql: string, params: any[] = []): Promise<any> {
    const response = await fetch(`${this.baseUrl}/v2/pipeline`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.authToken}`
      },
      body: JSON.stringify({
        requests: [{
          type: 'execute',
          stmt: {
            sql,
            args: params.map(p => ({ type: 'text', value: String(p) }))
          }
        }]
      })
    })

    if (!response.ok) {
      throw new Error(`Turso query failed: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()
    return data.results[0].response.result
  }

  async queryFilesByNames(fileNames: string[]): Promise<TursoFile[]> {
    if (fileNames.length === 0) return []
    
    const placeholders = fileNames.map(() => '?').join(',')
    const sql = `
      SELECT id, file_name, file_title, cdn_path, file_size, summary
      FROM files 
      WHERE file_name IN (${placeholders}) AND cdn_path IS NOT NULL
    `
    
    const result = await this.execute(sql, fileNames)
    return result.rows.map((row: any[]) => {
      // Extract values from Turso API response format
      const extractValue = (field: any) => {
        if (field && typeof field === 'object' && 'value' in field) {
          return field.value
        }
        return field // fallback for unexpected format
      }

      return {
        id: extractValue(row[0]),
        file_name: extractValue(row[1]), 
        file_title: extractValue(row[2]),
        cdn_path: extractValue(row[3]),
        file_size: extractValue(row[4]),
        summary: extractValue(row[5])
      }
    })
  }
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Initialize Supabase client (for usage limits only)
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    )

    // Initialize Turso client (for file queries)
    const tursoUrl = Deno.env.get('TURSO_URL')
    const tursoToken = Deno.env.get('TURSO_AUTH_TOKEN')
    
    if (!tursoUrl || !tursoToken) {
      console.error('Missing Turso credentials')
      return new Response(
        JSON.stringify({ error: 'Database configuration error' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    const tursoClient = new TursoClient(tursoUrl, tursoToken)

    // Parse request body
    const { query, firm_id }: SearchRequest = await req.json()

    if (!query) {
      return new Response(
        JSON.stringify({ error: 'Query parameter is required' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    if (!firm_id) {
      return new Response(
        JSON.stringify({ error: 'Firm ID is required' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Check usage limits first (still use Supabase)
    const { data: usageData, error: usageError } = await supabaseClient
      .rpc('check_firm_usage_limits', { input_firm_id: firm_id })

    if (usageError) {
      console.error('Usage check error:', usageError)
      return new Response(
        JSON.stringify({ error: 'Error checking usage limits' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    if (!usageData || usageData.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No usage data found' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    const usage: UsageData = usageData[0]

    if (!usage.can_query) {
      const limitMessage = `You have reached your ${usage.plan_name} plan's query limit. ` +
        `Daily: ${usage.daily_usage}/${usage.daily_limit} queries used. ` +
        `Monthly: ${usage.monthly_usage}/${usage.monthly_limit} queries used.`
      
      return new Response(
        JSON.stringify({ 
          error: limitMessage,
          usage: usage,
          billing_limit_reached: true,
          query
        }),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Record the query (still use Supabase)
    const { error: recordError } = await supabaseClient
      .rpc('record_user_query', { 
        query_text: query, 
        firm_id: firm_id 
      })

    if (recordError) {
      console.error('Error recording query:', recordError)
      // Don't fail the request for this, just log it
    }

    // CDN base URL
    const CDN_URL = 'https://cdn.caseon.io/'

    // Call the Modal search endpoint with query only (Google style - no limits)
    const modalSearchPayload = {
      query
    }

    console.log(`Search request: query="${query}", firm_id=${firm_id}, no limits`)
    console.log(`Modal payload: ${JSON.stringify(modalSearchPayload)}`)

    let modalResponse
    try {
      console.log('About to call Modal endpoint...')
      modalResponse = await fetch('https://exolutionza--caseon-inference-fastapi-wrapper.modal.run', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(modalSearchPayload)
      })

      console.log(`Modal response status: ${modalResponse.status}`)
      console.log(`Modal response headers: ${JSON.stringify([...modalResponse.headers.entries()])}`)

    } catch (fetchError) {
      console.error('Modal fetch error:', fetchError)
      console.error('Error type:', typeof fetchError)
      console.error('Error name:', fetchError.name)
      console.error('Error message:', fetchError.message)
      console.error('Error stack:', fetchError.stack)
      return new Response(
        JSON.stringify({ error: 'Network error calling search service' }),
        { 
          status: 503, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    if (!modalResponse.ok) {
      const errorText = await modalResponse.text()
      console.error('Modal search failed:', modalResponse.status, errorText)
      return new Response(
        JSON.stringify({ error: 'Search service unavailable' }),
        { 
          status: 503, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    const modalData: ModalSearchResponse = await modalResponse.json()

    console.log(`Modal search returned ${modalData.results?.length || 0} results`)

    if (!modalData.results || modalData.results.length === 0) {
      return new Response(
        JSON.stringify({ 
          results: [],
          total: 0,
          query,
          usage: usage
        }),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Extract file names from Modal results
    const fileNames = modalData.results.map(result => result.file_name)
    console.log(`Extracted ${fileNames.length} file names from Modal results`)
    console.log(`Sample file names: ${fileNames.slice(0, 5).join(', ')}`)

    // Query Turso for file details
    console.log('Querying Turso for file details...')
    let filesFromTurso: TursoFile[] = []
    
    try {
      filesFromTurso = await tursoClient.queryFilesByNames(fileNames)
      console.log(`Turso returned ${filesFromTurso.length} files with CDN paths`)
      
      // Log the data mismatch for debugging
      const tursoFileNames = new Set(filesFromTurso.map(f => f.file_name))
      const missingFiles = fileNames.filter(name => !tursoFileNames.has(name))
      if (missingFiles.length > 0) {
        console.warn(`Data sync issue: ${missingFiles.length} files from Modal not found in Turso with CDN paths`)
        console.warn(`Missing files sample: ${missingFiles.slice(0, 3).join(', ')}`)
      }
    } catch (tursoError) {
      console.error('Turso query error:', tursoError)
      return new Response(
        JSON.stringify({ error: 'Failed to fetch file details from database' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Create a map of file names to file data for quick lookup
    const fileMap = new Map()
    filesFromTurso.forEach(file => {
      fileMap.set(file.file_name, file)
    })

    // Combine Modal results with Turso file data
    console.log('Mapping Modal results to Turso data...')
    let mappedCount = 0
    let notFoundCount = 0
    console.log(`Model Result ${JSON.stringify(modalData)}`)

    const results: FileResult[] = modalData.results
      .map(modalResult => {
        const fileData = fileMap.get(modalResult.file_name)
        if (!fileData) {
          console.warn(`No file data found for ${modalResult.file_name}`)
          notFoundCount++
          return null
        }

        // Parse JSON summaries from Turso
        let summaries: Array<{model: string, content: string}> = []
        if (fileData.summary) {
          try {
            const parsedSummaries = JSON.parse(fileData.summary)
            if (Array.isArray(parsedSummaries)) {
              summaries = parsedSummaries.map(s => ({
                model: s.model || 'unknown',
                content: s.content || ''
              }))
            }
          } catch (parseError) {
            console.warn(`Failed to parse summaries JSON for file ${fileData.file_name}:`, parseError)
          }
        }

        mappedCount++
        return {
          id: fileData.id,
          file_name: modalResult.file_name,
          file_title: fileData.file_title || modalResult.file_name,
          pdf_url: `${CDN_URL}${fileData.cdn_path}`,
          file_size: fileData.file_size || modalResult.file_size,
          summaries
        }
      })
      .filter(result => result !== null) as FileResult[]

    console.log(`Mapping summary: ${mappedCount} successful, ${notFoundCount} not found in database`)
    console.log(`Returning ${results.length} results (filtered from ${modalData.results.length} Modal results)`)

    return new Response(
      JSON.stringify({ 
        results,
        total: modalData.total || results.length, // Use Modal's total count if available, fallback to results length
        query,
        usage: usage
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('Function error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})
