import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getEmbedding, preprocessContent, extractTextContent } from '../shared/embedding.ts'
import { decode as base64Decode } from 'https://deno.land/std@0.168.0/encoding/base64.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
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
      model: 'gpt-4o',
      messages
    })
  })
  if (!response.ok) throw new Error(`OpenAI API error: ${await response.text()}`)
  return response.json()
}

async function handleFileUpload(supabase, fileData, firmId, userId) {
  const bytes = base64Decode(fileData.base64)
  const buffer = bytes.buffer
  const uniqueFileName = `${Date.now()}-${fileData.name}`
  const storagePath = `${firmId}/${uniqueFileName}`
  
  console.log(`Uploading file: ${fileData.name}`)
  
  const { error: uploadError } = await supabase.storage
    .from('documents')
    .upload(storagePath, buffer, {
      contentType: fileData.type,
      upsert: false
    })
  if (uploadError) throw uploadError

  const { data: { publicUrl } } = supabase.storage
    .from('documents')
    .getPublicUrl(storagePath)

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
  return { chatFile }
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
      
        // 1. Upload newly attached files (and store in DB, but do not re-fetch)
        const processedFiles = await Promise.all(
          files.map(file => handleFileUpload(supabase, file, data.firmId, user.id))
        )
        if (processedFiles.length > 0) {
          console.log(`Uploaded ${processedFiles.length} file(s)`)
        }
      
        // 2. Get existing conversation history (just the text for old messages)
        const { data: history } = await supabase.rpc(
          'get_conversation_history',
          { p_conversation_id: conversationId }
        )
      
        // 3. Add the user's typed message (without file text) to DB
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
      
        // 4. Link newly uploaded files to this message
        if (processedFiles.length > 0 && userMessageId) {
          await supabase.rpc('link_message_files', {
            p_message_id: userMessageId,
            p_file_ids: processedFiles.map(pf => pf.chatFile.id)
          })
        }
      
        // 5. Build the messages for the LLM
        const formattedMessages: Array<{ role: string; content: string }> = []
      
        // A) Old messages get their stored content
        if (Array.isArray(history)) {
          for (const oldMsg of history) {
            formattedMessages.push({
              role: oldMsg.role,
              content: oldMsg.content || ''
            })
          }
        }
      
        // B) For the new user message, append text from the client’s `files` (using base64)
        let newUserContent = message
        for (const file of files) {
          try {
            const fileText = extractTextContent(file)
            console.log('Extracted File Text:', fileText)
            newUserContent += `\n\n=== File: ${file.name} ===\n${fileText}`
          } catch (err) {
            console.error(`Error extracting text from file "${file.name}":`, err)
          }
        }
      
        // Add combined user content to the messages array
        formattedMessages.push({ role: 'user', content: newUserContent })
      
        // 6. Send all messages to OpenAI
        const completion = await getChatCompletion(formattedMessages)
        console.log('Received AI response')
      
        // 7. Store the assistant's reply
        const aiResult = await supabase.rpc('add_chat_message', {
          p_conversation_id: conversationId,
          p_content: completion.choices[0].message.content,
          p_role: 'assistant',
          p_tokens_count: completion.usage?.completion_tokens || null,
          p_metadata: {
            model: completion.model,
            system_fingerprint: completion.system_fingerprint
          }
        })
        console.log('AI RPC result:', aiResult)
        const aiMessageId = aiResult.data?.[0]?.message_id || null
        console.log(`Assistant message added with id: ${aiMessageId}`)
      
        // 8. Return the same structure as before
        return new Response(JSON.stringify({
          userMessageId,
          assistantMessageId: aiMessageId,
          content: completion.choices[0].message.content,
          debug: { userResult, aiResult }
        }), { headers: corsHeaders })
      }
      
      case 'search': {
        if (!data.firmId) throw new Error('Firm ID is required')
        const { query, files = [], conversationId, similarity_threshold = 0.0, match_count = 3 } = data
        console.log(`Processing search with query: "${query}"`)
        const processedFiles = await Promise.all(
          files.map(file => handleFileUpload(supabase, file, data.firmId, user.id))
        )
        if (processedFiles.length > 0) {
          console.log(`Processed ${processedFiles.length} file(s) for search`)
        }
        const fileContents = files.map(file => extractTextContent(file))
        // const combinedContent = `${query}\n\nContext From Files:\n${fileContents.join('\n\n')}`
        const combinedContent = `${query}`

        const processedContent = preprocessContent(combinedContent)
        const embedding = await getEmbedding(processedContent)
        // console.log("RPC Req search_similar_files", embedding)

        // // Generate a random 1024-dimensional embedding
        // const embedding = Array.from({ length: 1024 }, () => {
        //   // random float in [-1, 1], with 4 decimal places
        //   return parseFloat(((Math.random() * 2) - 1).toFixed(4));
        // });

        // Call your Supabase RPC function with the random embedding
        const { data: similarFiles, error } = await supabase.rpc('search_similar_files', {
          query_embedding: embedding,
          similarity_threshold: similarity_threshold,
          match_count: match_count
        });

        console.log(similarFiles, error)

        if (similarFiles && similarFiles.length > 0) {
          console.log(`Found ${similarFiles.length} similar file(s)`)
          const ctnt = `I have found these relevant documents:\n${similarFiles.map((f: any) => 
                `- ${f.file_name} (${Math.round(f.similarity * 100)}% relevant)\n`
                ).join('\n\n')}`

          const { data: messageId } = await supabase.rpc(
            'add_chat_message',
            {
              p_conversation_id: conversationId,
              p_content: ctnt,
              p_role: 'assistant',
              p_tokens_count: null,
              p_metadata: { type: 'search_results' }
            }
          )
          const allFiles = [
            ...similarFiles.map((sf: any) => sf.file_id)
          ]
          await supabase.rpc(
            'link_message_files',
            {
              p_message_id: messageId,
              p_file_ids: allFiles
            }
          )
          return new Response(JSON.stringify({
            assistantMessageId: messageId,
            content: ctnt,
            files: similarFiles 
          }), { headers: corsHeaders })
        }
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
