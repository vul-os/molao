// main.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getEmbedding, fetchFileContent, preprocessContent } from '../shared/embedding.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
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

    // Fetch and process file content
    const fileContent = await fetchFileContent(file.cdn_path, file.mime_type)
    const processedContent = preprocessContent(fileContent)
    
    // Generate embedding using Voyage API
    const embedding = await getEmbedding(processedContent)

    // Save embedding
    const { error: insertError } = await supabaseClient
      .from('file_vectors')
      .insert({
        file_id: file.id,
        model: 'voyage-law-2',
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

// curl -X POST 'https://oedmyvlymptorkupspem.supabase.co/functions/v1/create-file-vector' \
//   -H "Content-Type: application/json" \
//   -d '{"file_id": "625d8759-0b51-42a1-bbd0-c0ff06544333"}'