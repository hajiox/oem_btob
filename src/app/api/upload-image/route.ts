import { NextRequest, NextResponse } from 'next/server'
import { put } from '@vercel/blob'

// 画像をVercel Blob StorageにアップロードするAPIルート
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

        // ファイル名を安全な形式に変換
        const timestamp = Date.now()
        const ext = file.name.split('.').pop() || 'jpg'
        const safeName = file.name
            .replace(/\.[^.]+$/, '')
            .replace(/[^a-zA-Z0-9_-]/g, '_')
            .substring(0, 50)
        const fileName = `form/${timestamp}_${safeName}.${ext}`

        // Vercel Blob にアップロード
        const blob = await put(fileName, file, {
            access: 'public',
        })

        return NextResponse.json({ url: blob.url, fileName })
    } catch (error: any) {
        console.error('Upload error:', error)
        return NextResponse.json(
            { error: error.message || 'アップロードに失敗しました' },
            { status: 500 }
        )
    }
}
