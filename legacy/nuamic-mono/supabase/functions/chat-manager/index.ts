import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { decode as base64Decode } from 'https://deno.land/std@0.168.0/encoding/base64.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
}

async function getEmbedding(text: string): Promise<number[]> {
  const openaiKey = Deno.env.get('OPENAI_API_KEY')
  if (!openaiKey) throw new Error('OpenAI API key not configured')
  console.log('Requesting embedding from OpenAI...')
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

async function getChatCompletion(messages: Array<{ role: string; content: string }>) {
  const openaiKey = Deno.env.get('OPENAI_API_KEY')
  if (!openaiKey) throw new Error('OpenAI API key not configured')
  console.log('Requesting chat completion from OpenAI...')
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openaiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'gpt-4-turbo-preview',
      messages,
      max_tokens: 1024
    })
  })
  if (!response.ok) throw new Error(`OpenAI API error: ${await response.text()}`)
  return response.json()
}

async function handleFileUpload(supabase, fileData, firmId, userId) {
  const bytes = base64Decode(fileData.base64)
  const buffer = bytes.buffer
  const uniqueFileName = `${Date.now()}-${fileData.name}`
  console.log(`Uploading file: ${fileData.name}`)
  const { error: uploadError } = await supabase.storage
    .from('documents')
    .upload(uniqueFileName, buffer, {
      contentType: fileData.type,
      upsert: false
    })
  if (uploadError) throw uploadError
  const { data: { publicUrl } } = supabase.storage
    .from('documents')
    .getPublicUrl(uniqueFileName)
  const { data: fileRecord, error: fileError } = await supabase
    .from('files')
    .insert({
      file_name: fileData.name,
      file_type: fileData.type,
      cdn_path: publicUrl,
      file_size: bytes.length,
      mime_type: fileData.type
    })
    .select()
    .single()
  if (fileError) throw fileError
  const { data: chatFile, error: chatFileError } = await supabase
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
    .single()
  if (chatFileError) throw chatFileError
  console.log(`File uploaded and recorded: ${fileData.name}`)
  return { fileRecord, chatFile }
}

function extractTextContent(fileData) {
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
    console.log(`Received ${req.method} request at ${req.url}`)
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )
    const token = req.headers.get('Authorization')?.split('Bearer ')[1]
    const { data: { user }, error: authError } = await supabase.auth.getUser(token ?? '')
    if (authError || !user) {
      console.log('Authentication failed')
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders })
    }
    console.log(`Authenticated user: ${user.id}`)
    const { action, ...data } = await req.json()
    console.log(`Processing action: ${action}`)
    
    switch (action) {
      case 'get-history': {
        if (!data.firmId) throw new Error('Firm ID is required')
        console.log(`Fetching conversation history for conversationId: ${data.conversationId}`)
        const { data: history, error: historyError } = await supabase.rpc(
          'get_conversation_history',
          { p_conversation_id: data.conversationId }
        )
        if (historyError) throw historyError
        const conversationHistory = Array.isArray(history) ? history : []
        return new Response(JSON.stringify(conversationHistory), { headers: corsHeaders })
      }
      
      case 'send-message': {
        if (!data.firmId) throw new Error('Firm ID is required')
        const { message, files = [], conversationId } = data
        console.log(`Processing send-message for conversationId: ${conversationId}`)
        
        // Handle file uploads
        const processedFiles = await Promise.all(
          files.map(file => handleFileUpload(supabase, file, data.firmId, user.id))
        )
        if (processedFiles.length > 0) {
          console.log(`Uploaded ${processedFiles.length} file(s)`)
        }
        
        // Get conversation history
        const { data: history } = await supabase.rpc(
          'get_conversation_history',
          { p_conversation_id: conversationId }
        )
        
        // Add user message by passing parameters directly
        const userResult = await supabase.rpc('add_chat_message', {
          p_conversation_id: conversationId,
          p_content: message,
          p_role: 'user',
          p_tokens_count: null,
          p_metadata: {}
        })
        console.log('User RPC result:', userResult)
        const userMessageId = userResult.data?.[0]?.message_id || null
        console.log(`User message added with id: ${userMessageId}`)
        
        // Link files to message if any were uploaded
        if (processedFiles.length > 0 && userMessageId) {
          await supabase.rpc(
            'link_message_files',
            {
              p_message_id: userMessageId,
              p_file_ids: processedFiles.map(pf => pf.chatFile.id)
            }
          )
        }
        
        // Format messages for the LLM
        const formattedMessages = [
          ...(Array.isArray(history) ? history : []),
          { role: 'user', content: message }
        ].map(msg => ({
          role: msg.role,
          content: msg.files?.length > 0
            ? `${msg.content}\n\nAttached files: ${msg.files.map((f: any) => f.filename).join(', ')}`
            : msg.content
        }))
        
        // Get AI completion
        const completion = await getChatCompletion(formattedMessages)
        console.log('Received AI response')
        
        // Add AI response by passing parameters directly
        const aiResult = await supabase.rpc('add_chat_message', {
          p_conversation_id: conversationId,
          p_content: completion.choices[0].message.content,
          p_role: 'assistant',
          p_tokens_count: completion.usage.completion_tokens,
          p_metadata: {
            model: completion.model,
            system_fingerprint: completion.system_fingerprint
          }
        })
        console.log('AI RPC result:', aiResult)
        const aiMessageId = aiResult.data?.[0]?.message_id || null
        console.log(`Assistant message added with id: ${aiMessageId}`)
        
        return new Response(JSON.stringify({
          userMessageId,
          assistantMessageId: aiMessageId,
          content: completion.choices[0].message.content,
          debug: { userResult, aiResult }
        }), { headers: corsHeaders })
      }
      
      case 'search': {
        if (!data.firmId) throw new Error('Firm ID is required')
        const { query, files = [], conversationId, similarity_threshold = 0.7, match_count = 5 } = data
        console.log(`Processing search with query: "${query}"`)
        const processedFiles = await Promise.all(
          files.map(file => handleFileUpload(supabase, file, data.firmId, user.id))
        )
        if (processedFiles.length > 0) {
          console.log(`Processed ${processedFiles.length} file(s) for search`)
        }
        const fileContents = files.map(file => extractTextContent(file))
        const combinedContent = `${query}\n\nContext:\n${fileContents.join('\n\n')}`
        const processedContent = preprocessContent(combinedContent)
        const embedding = await getEmbedding(processedContent)
        const { data: similarFiles } = await supabase.rpc(
          'search_similar_files',
          {
            query_embedding: embedding,
            similarity_threshold,
            match_count
          }
        )
        if (similarFiles && similarFiles.length > 0) {
          console.log(`Found ${similarFiles.length} similar file(s)`)
          const { data: messageId } = await supabase.rpc(
            'add_chat_message',
            {
              p_conversation_id: conversationId,
              p_content: `I have found these relevant documents:\n${similarFiles.map((f: any) => 
                `- ${f.file_name} (${Math.round(f.similarity * 100)}% relevant)\n${f.chunk_text}`
              ).join('\n\n')}`,
              p_role: 'system',
              p_tokens_count: null,
              p_metadata: { type: 'search_results' }
            }
          )
          const allFiles = [
            ...processedFiles.map(pf => pf.chatFile.id),
            ...similarFiles.map((sf: any) => sf.file_id)
          ]
          await supabase.rpc(
            'link_message_files',
            {
              p_message_id: messageId,
              p_file_ids: allFiles
            }
          )
        }
        return new Response(JSON.stringify({ 
          success: true, 
          files: similarFiles 
        }), { headers: corsHeaders })
      }
      
      default:
        console.log('Invalid action received')
        return new Response(JSON.stringify({ error: 'Invalid action' }), { status: 400, headers: corsHeaders })
    }
  } catch (error) {
    console.error('Error encountered:', error)
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders })
  }
})
