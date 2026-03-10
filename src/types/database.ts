// ============================================
// データベーステーブルの型定義
// ============================================

// [P] ページ (LP管理の親)
export interface Page {
    id: string
    slug: string
    title: string
    description: string | null
    seo_title: string | null
    seo_description: string | null
    og_title: string | null
    og_description: string | null
    og_image_url: string | null
    favicon_url: string | null
    created_at: string
    updated_at: string
}

export type PageInsert = Omit<Page, 'id' | 'created_at' | 'updated_at'>
export type PageUpdate = Partial<PageInsert>

// [A] LPセクション
export interface LpSection {
    id: string
    page_id: string
    order_index: number
    section_type: 'hero' | 'content' | 'feature' | 'cta' | 'testimonial' | 'faq'
    image_url: string | null
    title: string | null
    description: string | null
    is_visible: boolean
    created_at: string
    updated_at: string
}

export type LpSectionInsert = Omit<LpSection, 'id' | 'created_at' | 'updated_at'>
export type LpSectionUpdate = Partial<LpSectionInsert>

// [B] フォームステップ
export interface FormStep {
    id: string
    page_id: string
    order_index: number
    step_title: string
    step_description: string | null
    is_visible: boolean
    created_at: string
    updated_at: string
}

export type FormStepInsert = Omit<FormStep, 'id' | 'created_at' | 'updated_at'>
export type FormStepUpdate = Partial<FormStepInsert>

// フォーム質問
export interface FormQuestion {
    id: string
    step_id: string
    order_index: number
    question_text: string
    input_type: 'radio' | 'checkbox' | 'text' | 'textarea' | 'number' | 'select' | 'select_text' | 'select_number'
    is_required: boolean
    help_text: string | null
    depends_on_option_id: string | null  // この選択肢が選ばれた時のみ表示
    created_at: string
    updated_at: string
}

export type FormQuestionInsert = Omit<FormQuestion, 'id' | 'created_at' | 'updated_at'>
export type FormQuestionUpdate = Partial<FormQuestionInsert>

// フォーム選択肢
export interface FormOption {
    id: string
    question_id: string
    order_index: number
    label: string
    price_modifier: number
    is_base_price: boolean
    description: string | null
    image_url: string | null
    created_at: string
    updated_at: string
}

export type FormOptionInsert = Omit<FormOption, 'id' | 'created_at' | 'updated_at'>
export type FormOptionUpdate = Partial<FormOptionInsert>

// [C] リード
export interface Lead {
    id: string
    company_name: string
    contact_name: string
    email: string
    phone: string | null
    selected_options: SelectedOption[]
    estimated_total_price: number
    notes: string | null
    status: 'new' | 'contacted' | 'quoted' | 'negotiating' | 'won' | 'lost'
    created_at: string
    updated_at: string
}

export type LeadInsert = Omit<Lead, 'id' | 'created_at' | 'updated_at' | 'status'>
export type LeadUpdate = Partial<Omit<Lead, 'id' | 'created_at' | 'updated_at'>>

// 顧客が選んだオプションの構造
export interface SelectedOption {
    step_title: string
    question_text: string
    selected_label: string
    price_modifier: number
    is_base_price: boolean
}

// ============================================
// フォームビルダー用のネスト型
// ============================================

export interface FormStepWithQuestions extends FormStep {
    questions: FormQuestionWithOptions[]
}

export interface FormQuestionWithOptions extends FormQuestion {
    options: FormOption[]
}
