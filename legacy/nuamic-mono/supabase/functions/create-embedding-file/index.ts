import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
}

interface FileRecord {
  id: string
  file_name: string
  cdn_path: string
  mime_type: string
  file_size: number
}

async function extractRTFContent(buffer: ArrayBuffer): Promise<string> {
  // Basic RTF text extraction - removes RTF formatting
  const text = new TextDecoder().decode(buffer);
  return text
    .replace(/[\\][\w-]+/g, '') // Remove RTF commands
    .replace(/[{}]/g, '')       // Remove braces
    .replace(/\\\n/g, '\n')     // Handle line breaks
    .replace(/\\['']/g, "'")    // Handle quotes
    .replace(/\s+/g, ' ')       // Normalize whitespace
    .trim();
}

async function fetchFileContent(cdnUrl: string): Promise<string> {
  const response = await fetch(cdnUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch file: ${response.statusText}`);
  }
  
  const buffer = await response.arrayBuffer();
  const text = await extractRTFContent(buffer);
  return text;
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
      model: 'text-embedding-3-large',
      encoding_format: 'float'
    })
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`OpenAI API error: ${error}`)
  }

  const result = await response.json()
  return result.data[0].embedding
}

function preprocessContent(content: string): string {
  return content
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 8000) // OpenAI's token limit
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

    const { file_id } = await req.json()
    if (!file_id) {
      throw new Error('File ID is required')
    }

    // Fetch file record
    const { data: file, error: fileError } = await supabaseClient
      .from('files')
      .select('*')
      .eq('id', file_id)
      .single()

    if (fileError || !file) {
      throw new Error('File not found')
    }

    // Verify file is RTF
    if (!file.mime_type.toLowerCase().includes('rtf')) {
      throw new Error('File must be an RTF document')
    }

    // Fetch and process RTF content directly from CDN
    const fileContent = await fetchFileContent(file.cdn_path)
    
    // Preprocess content
    const processedContent = preprocessContent(fileContent)
    
    // Generate embedding
    const embedding = await getEmbedding(processedContent)

    // Save embedding
    const { error: insertError } = await supabaseClient
      .from('file_vectors')
      .insert({
        file_id: file.id,
        model: 'text-embedding-3-large',
        embedding,
        chunk_text: processedContent,
        metadata: {
          file_name: file.file_name,
          file_type: file.mime_type,
          file_size: file.file_size
        }
      })

    if (insertError) {
      throw new Error(`Error saving embedding: ${insertError.message}`)
    }

    return new Response(
      JSON.stringify({ 
        success: true,
        file_id: file.id,
        message: 'Embedding generated and saved successfully'
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