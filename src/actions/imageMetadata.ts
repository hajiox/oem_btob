'use server'

import { GoogleGenerativeAI } from '@google/generative-ai'

export async function generateImageMetadata(imageUrl: string): Promise<string> {
    try {
        const apiKey = process.env.GEMINI_API_KEY
        if (!apiKey) {
            console.error('GEMINI_API_KEY is not set')
            return ''
        }

        const genAI = new GoogleGenerativeAI(apiKey)
        // Gemini 2.0 Flash モデルを使用
        const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })

        // 画像データを取得してBase64に変換
        const response = await fetch(imageUrl)
        if (!response.ok) {
            throw new Error(`Failed to fetch image: ${response.statusText}`)
        }

        const arrayBuffer = await response.arrayBuffer()
        const buffer = Buffer.from(arrayBuffer)
        const base64Image = buffer.toString('base64')
        const mimeType = response.headers.get('content-type') || 'image/jpeg'

        const prompt = `このLP（ランディングページ）画像の主要なテキストやキャッチコピーを読み取り、この画像の内容を1〜2文の短く簡潔なテキスト（alt属性・タイトル用）として要約して出力してください。
条件：
- 余計な説明文（「画像には〇〇と書かれています」「〜というキャッチコピーです」等）は一切含めないでください。
- すぐにaltテキストとして使える結果のみを直接返してください。`

        const result = await model.generateContent([
            prompt,
            {
                inlineData: {
                    data: base64Image,
                    mimeType: mimeType
                }
            }
        ])

        const text = result.response.text().trim()
        return text
    } catch (error) {
        console.error('Gemini API Error:', error)
        return ''
    }
}
