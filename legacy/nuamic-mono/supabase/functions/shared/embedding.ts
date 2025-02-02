import { decode as base64Decode } from 'https://deno.land/std@0.168.0/encoding/base64.ts'

// fileOperations.ts
export interface FileRecord {
  id: string
  file_name: string
  cdn_path: string
  mime_type: string
  file_size: number
}

/**
 * Extracts text content from base64-encoded `fileData`.
 */
export function extractTextContent(fileData) {
  const bytes = base64Decode(fileData.base64)
  const text = new TextDecoder().decode(bytes)
  
  // Make sure we catch any MIME type that has "rtf" in it
  const lowerType = (fileData.type || '').toLowerCase()
  
  if (lowerType.includes('rtf')) {
    // If the file is RTF, strip out control words
    return stripRTFFormatting(text)
  }

  // Otherwise, just return the raw text (for docx, plain text, etc.)
  switch (lowerType) {
    case 'application/msword':
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    case 'application/vnd.oasis.opendocument.text':
    case 'text/plain':
    default:
      return text
  }
}
/**
 * Extracts text content from file buffer based on mime type.
 */
export async function extractFileContent(buffer: ArrayBuffer, mimeType: string): Promise<string> {
  const text = new TextDecoder().decode(buffer);
  
  const lowerType = mimeType.toLowerCase();
  
  if (lowerType.includes('rtf')) {
    return stripRTFFormatting(text);
  }

  switch (lowerType) {
    case 'application/msword':
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    case 'application/vnd.oasis.opendocument.text':
    case 'text/plain':
    default:
      return text;
  }
}

/**
 * Removes RTF control words, braces, escaped hex codes, etc.
 */
function stripRTFFormatting(rtfText: string): string {
  return rtfText
    .replace(/\\[A-Za-z]+\d*/g, ' ')
    .replace(/[{}]/g, '')
    .replace(/\\'[0-9a-fA-F]{2}/g, '')
    .replace(/\\u-?\d+(\?)?/g, ' ')
    .replace(/\\(par[d]?)/gi, '\n')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function fetchFileContent(cdnUrl: string, mimeType: string): Promise<string> {
  const response = await fetch(cdnUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch file: ${response.statusText}`);
  }
  
  const buffer = await response.arrayBuffer();
  return extractFileContent(buffer, mimeType);
}

export function preprocessContent(content: string): string {
  return content
    .trim()
    .replace(/\s+/g, ' ')
}

// llmOperations.ts
export async function getEmbedding(text: string): Promise<number[]> {
  const voyageKey = Deno.env.get('VOYAGE_API_KEY')
  if (!voyageKey) {
    throw new Error('Voyage API key not configured')
  }

  const response = await fetch('https://api.voyageai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${voyageKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      input: [text],
      model: 'voyage-law-2'
    })
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Voyage API error: ${error}`)
  }

  const result = await response.json()
  return result.data[0].embedding
}
