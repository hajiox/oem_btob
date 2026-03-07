import { NextRequest, NextResponse } from 'next/server'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'
import { existsSync } from 'fs'

// 画像をpublic/images/form/に保存するAPIルート
// ローカル開発時: ファイルシステムに直接保存
// 本番デプロイ: git pushで同期される
export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData()
        const file = formData.get('file') as File
        if (!file) {
            return NextResponse.json({ error: 'ファイルが選択されていません' }, { status: 400 })
        }

        // 画像ファイルのみ許可
        if (!file.type.startsWith('image/')) {
            return NextResponse.json({ error: '画像ファイルのみアップロード可能です' }, { status: 400 })
        }

        // ファイルサイズ制限 (5MB)
        if (file.size > 5 * 1024 * 1024) {
            return NextResponse.json({ error: 'ファイルサイズは5MB以下にしてください' }, { status: 400 })
        }

        // ファイル名を安全な形式に変換（タイムスタンプ + 元のファイル名）
        const timestamp = Date.now()
        const ext = path.extname(file.name) || '.jpg'
        const safeName = file.name
            .replace(ext, '')
            .replace(/[^a-zA-Z0-9_-]/g, '_')
            .substring(0, 50)
        const fileName = `${timestamp}_${safeName}${ext}`

        // 保存先ディレクトリ
        const uploadDir = path.join(process.cwd(), 'public', 'images', 'form')
        if (!existsSync(uploadDir)) {
            await mkdir(uploadDir, { recursive: true })
        }

        // ファイルをバッファに変換して書き込み
        const bytes = await file.arrayBuffer()
        const buffer = Buffer.from(bytes)
        const filePath = path.join(uploadDir, fileName)
        await writeFile(filePath, buffer)

        // 公開URLパスを返す
        const publicUrl = `/images/form/${fileName}`
        return NextResponse.json({ url: publicUrl, fileName })
    } catch (error) {
        console.error('Upload error:', error)
        return NextResponse.json({ error: 'アップロードに失敗しました' }, { status: 500 })
    }
}
