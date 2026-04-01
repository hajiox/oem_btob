import { ImageResponse } from 'next/og'

export const runtime = 'edge'

export const alt = '食品OEM パートナー'
export const size = {
  width: 1200,
  height: 630,
}
export const contentType = 'image/png'

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(to bottom right, #0F172A, #1E1B4B)',
          color: 'white',
          padding: '60px',
        }}
      >
        <div
          style={{
            display: 'flex',
            fontSize: 80,
            fontWeight: 'bold',
            marginBottom: '30px',
            color: '#F8FAFC',
            textAlign: 'center',
          }}
        >
          あなただけのオリジナル食品を
        </div>
        <div
          style={{
            display: 'flex',
            fontSize: 40,
            color: '#818CF8',
            textAlign: 'center',
            marginBottom: '60px',
          }}
        >
          小ロットから対応可能なB2B向け食品OEMサービス
        </div>
        
        <div
          style={{
            display: 'flex',
            background: 'rgba(255,255,255,0.1)',
            padding: '20px 40px',
            borderRadius: '20px',
            fontSize: 32,
            color: '#E0E7FF',
            alignItems: 'center',
          }}
        >
          <span style={{ marginRight: '20px', fontSize: 40 }}>💬</span>
          BTOお見積りシミュレーション機能搭載
        </div>
      </div>
    ),
    {
      ...size,
    }
  )
}
