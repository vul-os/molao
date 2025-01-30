import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { decode as base64Decode } from 'https://deno.land/std@0.168.0/encoding/base64.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
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

// Embedding functions
async function getEmbedding(text: string): Promise<number[]> {
  const openaiKey = Deno.env.get('OPENAI_API_KEY')
  if (!openaiKey) throw new Error('OpenAI API key not configured')

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

  if (!response.ok) throw new Error(`OpenAI API error: ${await response.text()}`)

  const result = await response.json()
  return result.data[0].embedding
}

// Chat completion function
async function getChatCompletion(messages: Array<{ role: string; content: string }>) {
  const openaiKey = Deno.env.get('OPENAI_API_KEY')
  if (!openaiKey) throw new Error('OpenAI API key not configured')

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openaiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages,
      max_tokens: 1024
    })
  })

  if (!response.ok) throw new Error(`OpenAI API error: ${await response.text()}`)

  return response.json()
}

// File handling functions
async function handleFileUpload(supabaseClient, fileData, firmId, userId) {
  const bytes = base64Decode(fileData.base64);
  const buffer = bytes.buffer;
  
  // Generate a unique filename
  const timestamp = new Date().getTime();
  const uniqueFileName = `${timestamp}-${fileData.name}`;
  
  // Upload to Supabase storage
  const { data: uploadData, error: uploadError } = await supabaseClient
    .storage
    .from('documents')
    .upload(uniqueFileName, buffer, {
      contentType: fileData.type,
      upsert: false
    });

  if (uploadError) throw uploadError;

  // Get the public URL
  const { data: { publicUrl } } = supabaseClient
    .storage
    .from('documents')
    .getPublicUrl(uniqueFileName);

  // Insert into main files table
  const { data: fileRecord, error: fileError } = await supabaseClient
    .from('files')
    .insert({
      file_name: fileData.name,
      file_type: fileData.type,
      cdn_path: publicUrl,
      file_size: bytes.length,
      mime_type: fileData.type
    })
    .select()
    .single();

  if (fileError) throw fileError;

  // Insert into chat_files
  const { data: chatFile, error: chatFileError } = await supabaseClient
    .from('chat_files')
    .insert({
      firm_id: firmId,
      filename: fileData.name,
      file_type: fileData.type,
      size_bytes: bytes.length,
      storage_path: publicUrl,
      created_by: userId
    })
    .select()
    .single();

  if (chatFileError) throw chatFileError;

  return { fileRecord, chatFile };
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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(
      req.headers.get('Authorization')?.split('Bearer ')[1] ?? ''
    )

    if (authError || !user) throw new Error('Unauthorized')

    const url = new URL(req.url)
    const path = url.pathname.split('/').filter(Boolean)
    const method = req.method

    if (path[0] === 'conversations') {
      // List conversations
      if (method === 'GET' && !path[1]) {
        const { firm_id } = url.searchParams
        if (!firm_id) throw new Error('Firm ID is required')

        const { data, error } = await supabaseClient.rpc(
          'get_recent_conversations',
          { p_firm_id: firm_id }
        )

        if (error) throw error

        return new Response(JSON.stringify(data), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      // Get conversation history
      if (method === 'GET' && path[1] && path[2] === 'messages') {
        const { data, error } = await supabaseClient.rpc(
          'get_conversation_history',
          { p_conversation_id: path[1] }
        )

        if (error) throw error

        return new Response(JSON.stringify(data), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      // Search files
      if (method === 'POST' && path[1] && path[2] === 'search') {
        const { query, files = [], firm_id, similarity_threshold = 0.7, match_count = 5 } = await req.json()

        if (!firm_id) throw new Error('Firm ID is required')

        // Process uploaded files
        const processedFiles = await Promise.all(files.map(file => 
          handleFileUpload(supabaseClient, file, firm_id, user.id)
        ))

        // Extract and process file contents
        const fileContents = files.map(file => extractTextContent(file))
        const combinedContent = `${query}\n\nContext:\n${fileContents.join('\n\n')}`
        const processedContent = preprocessContent(combinedContent)
        
        // Generate embedding
        const embedding = await getEmbedding(processedContent)

        // Search for similar files
        const { data: similarFiles, error: searchError } = await supabaseClient.rpc(
          'search_similar_files',
          {
            query_embedding: embedding,
            similarity_threshold,
            match_count
          }
        )

        if (searchError) throw searchError

        if (similarFiles.length > 0) {
          // Add system message about found files
          const { data: messageId } = await supabaseClient.rpc(
            'add_chat_message',
            {
              p_conversation_id: path[1],
              p_content: `I have found these relevant documents:\n${similarFiles.map(f => 
                `- ${f.file_name} (${Math.round(f.similarity * 100)}% relevant)\n${f.chunk_text}`
              ).join('\n\n')}`,
              p_role: 'system',
              p_metadata: { type: 'search_results' }
            }
          )

          // Link both uploaded and found files to the message
          const allFiles = [
            ...processedFiles.map(pf => pf.chatFile.id),
            ...similarFiles.map(sf => sf.file_id)
          ]

          await supabaseClient.rpc(
            'link_message_files',
            {
              p_message_id: messageId,
              p_file_ids: allFiles
            }
          )
        }

        return new Response(
          JSON.stringify({ 
            success: true, 
            files: similarFiles 
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Regular message
      if (method === 'POST' && path[1] && path[2] === 'messages') {
        const { message, files = [], firm_id } = await req.json()

        if (!firm_id) throw new Error('Firm ID is required')

        // Process any uploaded files first
        const processedFiles = await Promise.all(files.map(file => 
          handleFileUpload(supabaseClient, file, firm_id, user.id)
        ))

        // Get conversation history
        const { data: history, error: historyError } = await supabaseClient.rpc(
          'get_conversation_history',
          { p_conversation_id: path[1] }
        )

        if (historyError) throw historyError

        // Add user message
        const { data: messageId, error: messageError } = await supabaseClient.rpc(
          'add_chat_message',
          {
            p_conversation_id: path[1],
            p_content: message,
            p_role: 'user'
          }
        )

        if (messageError) throw messageError

        // Link uploaded files to the message
        if (processedFiles.length > 0) {
          await supabaseClient.rpc(
            'link_message_files',
            {
              p_message_id: messageId,
              p_file_ids: processedFiles.map(pf => pf.chatFile.id)
            }
          )
        }

        // Format messages for OpenAI
        const messages = [...history, { role: 'user', content: message }].map(msg => ({
          role: msg.role,
          content: msg.files.length > 0
            ? `${msg.content}\n\nAttached files: ${msg.files.map(f => f.filename).join(', ')}`
            : msg.content
        }))

        // Get AI response
        const completion = await getChatCompletion(messages)

        // Store AI response
        const { data: aiMessageId, error: aiError } = await supabaseClient.rpc(
          'add_chat_message',
          {
            p_conversation_id: path[1],
            p_content: completion.choices[0].message.content,
            p_role: 'assistant',
            p_tokens_count: completion.usage.completion_tokens,
            p_metadata: {
              model: completion.model,
              system_fingerprint: completion.system_fingerprint
            }
          }
        )

        if (aiError) throw aiError

        return new Response(
          JSON.stringify({
            message_id: aiMessageId,
            content: completion.choices[0].message.content
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    throw new Error('Not found')

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: error.message === 'Not found' ? 404 : 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
});