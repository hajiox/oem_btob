'use server'

import { GoogleGenerativeAI } from '@google/generative-ai'
import { createClient } from '@/lib/supabase/server'
import { updatePageSeo } from './pages'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '')

export async function generateSeoFromPageContent(pageId: string) {
    if (!process.env.GEMINI_API_KEY) {
        return { success: false, error: 'GEMINI_API_KEYが設定されていません' }
    }

    try {
        const supabase = await createClient()

        // ページ情報の取得
        const { data: pageData } = await supabase.from('pages').select('*').eq('id', pageId).single()
        if (!pageData) return { success: false, error: 'ページが見つかりません' }

        // LPセクション情報の取得
        const { data: lpSections } = await supabase
            .from('lp_sections')
            .select('*')
            .eq('page_id', pageId)
            .eq('is_visible', true)
            .order('order_index')

        if (!lpSections || lpSections.length === 0) {
            return { success: false, error: 'LPセクション（画像等）が存在しないため、分析できません' }
        }

        // フォーム構成の取得
        const { data: formSteps } = await supabase
            .from('form_steps')
            .select('*')
            .eq('page_id', pageId)
            .eq('is_visible', true)

        let analysisText = `【ページタイトル】: ${pageData.title}\n`
        analysisText += `【ページ説明】: ${pageData.description}\n\n`
        analysisText += `【LPコンテンツ内容（画像altテキスト・概要）】\n`
        lpSections.forEach(s => {
            analysisText += `- ${s.title || ''} ${s.description || ''}\n`
        })

        if (formSteps && formSteps.length > 0) {
            analysisText += `\n【入力フォーム概要】\n`
            formSteps.forEach(s => {
                analysisText += `- ${s.step_title}\n`
            })
        }

        const prompt = `
あなたはプロフェッショナルなSEOコンサルタント・Webマーケターです。
以下のランディングページ（LP）のコンテンツ内容を分析し、最適なSEO（検索エンジン最適化）メタ情報およびOGP（SNS共有用）メタ情報を生成してください。

【LPコンテンツ内容】
${analysisText}

【出力要件】
以下の情報をJSON形式で出力してください（マークダウンのコードブロックは不要です。純粋なJSON文字列のみを出力してください）。
{
  "seo_title": "検索結果でクリックされやすい、魅力的なページタイトル（30文字程度）",
  "seo_description": "検索結果のスニペットに表示される、ページ内容を適切に要約した説明文（100〜120文字程度）",
  "og_title": "SNS（TwitterやFacebookなど）でシェアされた際に目を引くタイトル（文字数制限は特にないが、キャッチーに）",
  "og_description": "SNSでシェアされた際に表示される説明文（80〜100文字程度）",
  "og_image_url": "提供されたLPコンテンツの中で、一番最初の画像のURL（OGP画像用）"
}

もし、OGP画像用に使えそうなURLがあればそれを使ってください。コンテンツ内容リストの最初の行に関連する画像があれば、そのURL（例えば ${lpSections[0]?.image_url} など）を利用してください。
`

        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-pro' })
        const result = await model.generateContent(prompt)
        const response = await result.response
        let text = response.text()

        // JSONのパース
        text = text.trim()
        if (text.startsWith('```json')) text = text.replace(/^```json\s*/, '')
        if (text.startsWith('```')) text = text.replace(/^```\s*/, '')
        text = text.replace(/\s*```$/, '')

        const seoData = JSON.parse(text)

        // 画像URLフォールバック処理
        if (!seoData.og_image_url || seoData.og_image_url === '') {
            const firstImg = lpSections.find(s => s.image_url)
            if (firstImg) seoData.og_image_url = firstImg.image_url
        }

        // DB保存
        await updatePageSeo(pageId, {
            seo_title: seoData.seo_title,
            seo_description: seoData.seo_description,
            og_title: seoData.og_title,
            og_description: seoData.og_description,
            og_image_url: seoData.og_image_url
        })

        return { success: true, data: seoData }

    } catch (e: any) {
        console.error('generateSeoFromPageContent error:', e)
        return { success: false, error: e.message || 'SEO情報の生成中にエラーが発生しました' }
    }
}
