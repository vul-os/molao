import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { decode as base64Decode } from 'https://deno.land/std@0.168.0/encoding/base64.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
}

interface FileData {
  name: string
  content: string
  type: string
  base64: string
}

interface SimilarFile {
  file_id: string
  file_name: string
  file_type: string
  cdn_path: string
  chunk_text: string
  similarity: number
  metadata: Record<string, unknown>
  file_size: number
  mime_type: string
}

interface EmbeddingResponse {
  object: string
  data: {
    object: string
    embedding: number[]
    index: number
  }[]
  model: string
  usage: {
    prompt_tokens: number
    total_tokens: number
  }
}

async function getEmbedding(text: string): Promise<number[]> {
  const openaiKey = Deno.env.get('OPENAI_API_KEY')
  if (!openaiKey) {
    throw new Error('OpenAI API key not configured')
  }

  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openaiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      input: text,
      model: 'text-embedding-ada-002',
      encoding_format: 'float'
    })
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`OpenAI API error: ${error}`)
  }

  const result: EmbeddingResponse = await response.json()
  return result.data[0].embedding
}

function extractTextContent(fileData: FileData): string {
  const bytes = base64Decode(fileData.base64)
  const text = new TextDecoder().decode(bytes)
  
  switch (fileData.type.toLowerCase()) {
    case 'rtf':
      return stripRTFFormatting(text)
    case 'application/msword':
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    case 'application/vnd.oasis.opendocument.text':
      // For Word and ODT files, the content should already be extracted and base64 encoded
      return text
    case 'text/plain':
    default:
      return text
  }
}

function stripRTFFormatting(rtfText: string): string {
  return rtfText.replace(/[\\][\w\d]+/g, '')
                .replace(/[{}]/g, '')
                .replace(/\\\n/g, '\n')
                .trim()
}

function preprocessContent(content: string): string {
  return content
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 8000)
}

function combinePromptWithContent(prompt: string, fileContents: string[]): string {
  // Combine prompt with file contents
  const combinedText = `${prompt}\n\nContext:\n${fileContents.join('\n\n')}`
  return preprocessContent(combinedText)
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    if (req.method !== 'POST') {
      throw new Error('Method not allowed')
    }

    // Initialize Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      }
    )

    const { prompt, files, similarity_threshold = 0.7, match_count = 5 } = await req.json() as { 
      prompt: string
      files: FileData[]
      similarity_threshold?: number
      match_count?: number
    }
    
    if (!prompt) {
      throw new Error('No search prompt provided')
    }

    if (!Array.isArray(files) || files.length === 0) {
      throw new Error('No files provided')
    }

    try {
      // Extract content from all files
      const fileContents = files.map(file => extractTextContent(file))
      
      // Combine prompt with file contents
      const combinedContent = combinePromptWithContent(prompt, fileContents)
      
      // Generate embedding for combined content
      const embedding = await getEmbedding(combinedContent)

      // Search for similar files using the PostgreSQL function
      const { data: similarFiles, error } = await supabaseClient.rpc(
        'search_similar_files',
        {
          query_embedding: embedding,
          similarity_threshold,
          match_count
        }
      )

      if (error) throw error

      return new Response(
        JSON.stringify({
          success: true,
          query: {
            prompt: prompt,
            files: files.map(f => f.name)
          },
          similar_files: (similarFiles as SimilarFile[]).map(file => ({
            file_name: file.file_name,
            file_type: file.file_type,
            cdn_path: file.cdn_path,
            chunk_text: file.chunk_text,
            similarity: Math.round(file.similarity * 100) / 100,
            file_size: file.file_size,
            mime_type: file.mime_type,
            metadata: file.metadata
          }))
        }),
        { 
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        }
      )
    } catch (error) {
      throw new Error(`Error processing files and prompt: ${error.message}`)
    }

  } catch (error) {
    console.error('Error processing request:', error)
    
    return new Response(
      JSON.stringify({ 
        success: false,
        error: 'Internal server error',
        details: error.message 
      }),
      { 
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      }
    )
  }
})