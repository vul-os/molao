import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface GetFileRequest {
  file_id: string
}

interface FileDetailsResponse {
  id: string
  file_name: string
  file_title: string
  pdf_url: string
  file_size?: number
  mime_type?: string
  created_at?: string
  updated_at?: string
  summaries?: Array<{
    model: string
    content: string
  }>
}

interface TursoFile {
  id: string
  file_name: string
  file_title?: string
  cdn_path: string
  file_size?: number
  mime_type?: string
  created_at?: string
  updated_at?: string
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

  async getFileById(fileId: string): Promise<TursoFile | null> {
    const sql = `
      SELECT id, file_name, file_title, cdn_path, file_size, mime_type, created_at, updated_at, summary
      FROM files 
      WHERE id = ? AND cdn_path IS NOT NULL
    `
    
    const result = await this.execute(sql, [fileId])
    
    if (!result.rows || result.rows.length === 0) {
      return null
    }

    const row = result.rows[0]
    
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
      mime_type: extractValue(row[5]),
      created_at: extractValue(row[6]),
      updated_at: extractValue(row[7]),
      summary: extractValue(row[8])
    }
  }
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Initialize Turso client
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
    const { file_id }: GetFileRequest = await req.json()

    if (!file_id) {
      return new Response(
        JSON.stringify({ error: 'File ID is required' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    console.log(`Getting file details for ID: ${file_id}`)

    // Query Turso for file details
    let fileData: TursoFile | null
    
    try {
      fileData = await tursoClient.getFileById(file_id)
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

    if (!fileData) {
      return new Response(
        JSON.stringify({ error: 'File not found' }),
        { 
          status: 404, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Parse JSON summaries
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

    // CDN base URL
    const CDN_URL = 'https://cdn.caseon.io/'

    const response: FileDetailsResponse = {
      id: fileData.id,
      file_name: fileData.file_name,
      file_title: fileData.file_title || fileData.file_name,
      pdf_url: `${CDN_URL}${fileData.cdn_path}`,
      file_size: fileData.file_size,
      mime_type: fileData.mime_type,
      created_at: fileData.created_at,
      updated_at: fileData.updated_at,
      summaries
    }

    console.log(`Successfully retrieved file details for: ${fileData.file_name}`)

    return new Response(
      JSON.stringify(response),
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