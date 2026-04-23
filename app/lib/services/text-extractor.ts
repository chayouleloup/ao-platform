/**
 * Text Extractor Service
 * Extrait le texte brut des fichiers PDF/DOCX stockés dans Supabase Storage
 * Utilise Claude Vision pour les PDF et une approche directe pour le texte
 */

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages'
const MODEL = 'claude-sonnet-4-20250514'

/**
 * Télécharge un fichier depuis une URL et le convertit en base64
 */
async function fetchFileAsBase64(url: string): Promise<{ data: string; mediaType: string } | null> {
  try {
    const response = await fetch(url)
    if (!response.ok) return null

    const buffer = await response.arrayBuffer()
    const base64 = Buffer.from(buffer).toString('base64')
    const contentType = response.headers.get('content-type') ?? 'application/octet-stream'

    return { data: base64, mediaType: contentType }
  } catch {
    return null
  }
}

/**
 * Extrait le texte d'un PDF via Claude Vision
 */
async function extractTextFromPDF(fileUrl: string, fileName: string): Promise<string> {
  const file = await fetchFileAsBase64(fileUrl)
  if (!file) return ''

  // Si c'est un PDF, on utilise Claude avec le document
  const isPDF = file.mediaType.includes('pdf') || fileName.toLowerCase().endsWith('.pdf')

  if (!isPDF) return ''

  try {
    const response = await fetch(ANTHROPIC_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'pdfs-2024-09-25',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 4000,
        system: 'Extrais tout le texte de ce document PDF de manière fidèle. Conserve la structure (titres, articles, tableaux). Réponds uniquement avec le texte extrait, sans commentaire.',
        messages: [{
          role: 'user',
          content: [
            {
              type: 'document',
              source: {
                type: 'base64',
                media_type: 'application/pdf',
                data: file.data,
              },
            },
            {
              type: 'text',
              text: `Extrais tout le texte de ce document DCE : "${fileName}"`,
            },
          ],
        }],
      }),
    })

    const data = await response.json()
    return data.content?.find((c: { type: string }) => c.type === 'text')?.text ?? ''
  } catch (err) {
    console.error('PDF extraction error:', err)
    return ''
  }
}

/**
 * Point d'entrée principal : extrait le texte selon le type MIME
 */
export async function extractTextFromDocument(
  fileUrl: string,
  fileName: string,
  mimeType: string | null
): Promise<string> {
  const ext = fileName.toLowerCase().split('.').pop()

  // PDF
  if (mimeType?.includes('pdf') || ext === 'pdf') {
    return extractTextFromPDF(fileUrl, fileName)
  }

  // Pour les autres types (DOCX, etc.), on retourne vide pour l'instant
  // (nécessite un worker backend avec python-docx ou libreoffice)
  // Le texte sera extrait manuellement ou via un webhook
  return `[Extraction non disponible pour ${ext?.toUpperCase()} — texte à extraire manuellement]`
}

/**
 * Extrait et met à jour le texte de tous les documents d'une version DCE
 */
export async function extractAllDocumentsText(
  documents: Array<{
    id: string
    file_url: string | null
    file_name: string
    mime_type: string | null
    extracted_text: string | null
    extraction_status: string
  }>,
  onProgress?: (docId: string, status: 'done' | 'error') => void
): Promise<Map<string, string>> {
  const results = new Map<string, string>()

  for (const doc of documents) {
    // Skip si déjà extrait
    if (doc.extracted_text && doc.extraction_status === 'done') {
      results.set(doc.id, doc.extracted_text)
      continue
    }

    if (!doc.file_url) {
      onProgress?.(doc.id, 'error')
      continue
    }

    try {
      const text = await extractTextFromDocument(doc.file_url, doc.file_name, doc.mime_type)
      results.set(doc.id, text)
      onProgress?.(doc.id, 'done')
    } catch {
      onProgress?.(doc.id, 'error')
    }
  }

  return results
}
