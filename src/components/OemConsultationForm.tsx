'use client'

import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { submitOemConsultation } from '@/actions/publicForm'
import { OEM_CONSULTATION_THEMES, type OemConsultationInput } from '@/lib/oem-consultation'
import { validateContactInfo } from '@/lib/oem-quote-validation'
import { OEM_PRODUCT_NAMES, trackOemEvent, trackOemInteraction, type OemFieldName } from '@/lib/oem-analytics'
import styles from './OemConsultationForm.module.css'

type ConsultationTheme = OemConsultationInput['theme']
type ContactFields = Pick<OemConsultationInput, 'companyName' | 'contactName' | 'email' | 'phone' | 'notes'>
const contactAnalyticsFields = {
    companyName: 'company_name', contactName: 'contact_name', email: 'email', phone: 'phone', notes: 'notes',
} satisfies Record<keyof ContactFields, OemFieldName>

export default function OemConsultationForm({ initialProductId }: { initialProductId?: string }) {
    const formId = useId()
    const [contact, setContact] = useState<ContactFields>({ companyName: '', contactName: '', email: '', phone: '', notes: '' })
    const [productId, setProductId] = useState(initialProductId || '')
    const [theme, setTheme] = useState<ConsultationTheme | ''>('')
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [isSuccess, setIsSuccess] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const submittingRef = useRef(false)
    const startedRef = useRef(false)
    const completedRef = useRef(false)
    const productRef = useRef(productId)
    const startedAtRef = useRef<number | null>(null)
    const idempotencyKeyRef = useRef<string | null>(null)
    const exitSentRef = useRef(false)
    const attemptPendingRef = useRef(false)
    const attemptTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const lotGuide = productId === 'c0000001-0000-0000-0000-000000000006'
        ? 'お茶のロット目安：4包×400個、または50包×100袋。原料のご支給が必須です。'
        : productId === 'c0000001-0000-0000-0000-000000000002'
            ? 'ラーメンの製造ロット目安：約400セット（2食入り）。'
            : productId && OEM_PRODUCT_NAMES[productId]
                ? `${OEM_PRODUCT_NAMES[productId]}の製造ロット目安：約400個。`
                : 'ロット目安：カレー約400個、ラーメン約400セット（2食入り）。その他の商品は仕様によります。'

    useEffect(() => {
        const onPageHide = () => {
            if (!startedRef.current || completedRef.current || exitSentRef.current) return
            exitSentRef.current = true
            trackOemInteraction('oem_form_exit', productRef.current || undefined, {
                inquiry_type: 'direct', step_kind: 'contact',
                elapsed_seconds: Math.min(86400, Math.max(0, Math.floor((Date.now() - (startedAtRef.current || Date.now())) / 1000))),
            }, { once: false })
        }
        window.addEventListener('pagehide', onPageHide)
        return () => {
            window.removeEventListener('pagehide', onPageHide)
            if (attemptTimerRef.current !== null) clearTimeout(attemptTimerRef.current)
            onPageHide()
        }
    }, [])

    const startContact = (field?: OemFieldName) => {
        if (!startedRef.current) {
            startedRef.current = true
            startedAtRef.current = Date.now()
            trackOemEvent('oem_start_consultation', productId || undefined, { inquiry_type: 'direct' })
            trackOemInteraction('oem_form_start', productId || undefined, { inquiry_type: 'direct', step_kind: 'contact' })
            trackOemInteraction('oem_contact_start', productId || undefined, { inquiry_type: 'direct', step_kind: 'contact' })
        }
        if (field) trackOemInteraction('oem_field_start', productId || undefined, { inquiry_type: 'direct', step_kind: 'contact', field_name: field })
    }

    const changed = () => {
        idempotencyKeyRef.current = null
        setError(null)
    }

    const recordSubmitAttempt = () => {
        if (attemptPendingRef.current || submittingRef.current) return
        attemptPendingRef.current = true
        trackOemInteraction('oem_submit_attempt', productId || undefined, { inquiry_type: 'direct', step_kind: 'contact' }, { once: false })
        attemptTimerRef.current = setTimeout(() => { attemptPendingRef.current = false }, 0)
    }

    const changeContact = (field: keyof ContactFields, value: string) => {
        changed()
        setContact(previous => ({ ...previous, [field]: value }))
    }

    const submit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        if (submittingRef.current) return
        startContact()
        recordSubmitAttempt()

        const contactError = validateContactInfo(contact)
        if (contactError || !theme) {
            setError(contactError || '相談テーマを選んでください。')
            trackOemInteraction('oem_validation_error', productId || undefined, { inquiry_type: 'direct', step_kind: 'contact', error_type: 'invalid_contact' }, { once: false })
            return
        }

        submittingRef.current = true
        setIsSubmitting(true)
        setError(null)
        try {
            idempotencyKeyRef.current ||= crypto.randomUUID()
            const input: OemConsultationInput = {
                companyName: contact.companyName.trim(),
                contactName: contact.contactName.trim(),
                email: contact.email.trim().toLowerCase(),
                phone: contact.phone?.trim() || '',
                notes: contact.notes?.trim() || '',
                theme,
                ...(productId ? { productId } : {}),
                idempotencyKey: idempotencyKeyRef.current,
            }
            const result = await submitOemConsultation(input)
            if (result.success) {
                completedRef.current = true
                if (!result.duplicate) trackOemEvent('generate_lead', productId || undefined, { inquiry_type: 'direct' })
                trackOemInteraction('oem_step_view', productId || undefined, { inquiry_type: 'direct', step_kind: 'complete' })
                setIsSuccess(true)
            } else {
                setError(result.error || '送信できませんでした。入力内容を確認し、もう一度お試しください。')
                trackOemInteraction('oem_submit_error', productId || undefined, { inquiry_type: 'direct', step_kind: 'contact', error_type: 'submission_failed' }, { once: false })
            }
        } catch {
            setError('通信エラーが発生しました。入力内容は保持しています。受付済みの可能性があるため、確認メールをご確認のうえ、届いていなければ再度お試しください。')
            trackOemInteraction('oem_submit_error', productId || undefined, { inquiry_type: 'direct', step_kind: 'contact', error_type: 'network' }, { once: false })
        } finally {
            submittingRef.current = false
            setIsSubmitting(false)
        }
    }

    if (isSuccess) return <section className={styles.success} aria-live="polite">
        <h2>ご相談を受け付けました</h2>
        <p>内容を確認し、ご入力のメールアドレスへご連絡します。</p>
        <p>この送信で費用は発生せず、正式発注にもなりません。</p>
        <Link href="/btob" className={styles.backLink}>食品OEMの案内へ戻る</Link>
    </section>

    return <form className={styles.form} onSubmit={submit}
        onInvalid={() => {
            if (attemptPendingRef.current || submittingRef.current) return
            startContact()
            recordSubmitAttempt()
            trackOemInteraction('oem_validation_error', productId || undefined, { inquiry_type: 'direct', step_kind: 'contact', error_type: 'required' }, { once: false })
        }}>
        <p className={styles.requiredNote}><span aria-hidden="true">＊</span>は必須です。商品や包装、数量が決まっていなくても相談できます。</p>
        <fieldset className={styles.fields} disabled={isSubmitting}>
            <div className={styles.field}>
                <label htmlFor={`${formId}-product`}>相談する商品<span className={styles.optional}>任意</span></label>
                <select id={`${formId}-product`} value={productId} aria-describedby={`${formId}-lot`} onFocus={() => startContact()}
                    onChange={event => { changed(); setProductId(event.target.value); productRef.current = event.target.value }}>
                    <option value="">未定・相談して決めたい</option>
                    {Object.entries(OEM_PRODUCT_NAMES).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                </select>
                <p id={`${formId}-lot`} className={styles.hint}>{lotGuide}</p>
            </div>
            <div className={styles.field}>
                <label htmlFor={`${formId}-company`}>会社名・農園名・屋号<span className={styles.required}>＊</span></label>
                <input id={`${formId}-company`} name="companyName" required maxLength={200} autoComplete="organization" value={contact.companyName}
                    onFocus={() => startContact(contactAnalyticsFields.companyName)} onChange={event => changeContact('companyName', event.target.value)} placeholder="例：会津〇〇農園" />
                <p className={styles.hint}>個人・インフルエンサーの方は個人名をご入力ください。</p>
            </div>
            <div className={styles.field}>
                <label htmlFor={`${formId}-name`}>お名前<span className={styles.required}>＊</span></label>
                <input id={`${formId}-name`} name="contactName" required maxLength={200} autoComplete="name" value={contact.contactName}
                    onFocus={() => startContact(contactAnalyticsFields.contactName)} onChange={event => changeContact('contactName', event.target.value)} placeholder="例：山田 太郎" />
            </div>
            <div className={styles.field}>
                <label htmlFor={`${formId}-email`}>メールアドレス<span className={styles.required}>＊</span></label>
                <input id={`${formId}-email`} name="email" required type="email" maxLength={254} autoComplete="email" value={contact.email}
                    onFocus={() => startContact(contactAnalyticsFields.email)} onChange={event => changeContact('email', event.target.value)} placeholder="info@example.com" />
            </div>
            <div className={styles.field}>
                <label htmlFor={`${formId}-phone`}>電話番号<span className={styles.optional}>任意</span></label>
                <input id={`${formId}-phone`} name="phone" type="tel" maxLength={50} autoComplete="tel" value={contact.phone}
                    onFocus={() => startContact(contactAnalyticsFields.phone)} onChange={event => changeContact('phone', event.target.value)} placeholder="例：0242-00-0000" />
            </div>
            <div className={styles.field}>
                <label htmlFor={`${formId}-theme`}>相談テーマ<span className={styles.required}>＊</span></label>
                <select id={`${formId}-theme`} name="theme" required value={theme} onFocus={() => startContact()}
                    onChange={event => { changed(); setTheme(event.target.value as ConsultationTheme | '') }}>
                    <option value="">選んでください</option>
                    {Object.entries(OEM_CONSULTATION_THEMES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
            </div>
            <div className={styles.field}>
                <label htmlFor={`${formId}-notes`}>補足<span className={styles.optional}>任意</span></label>
                <textarea id={`${formId}-notes`} name="notes" maxLength={5000} rows={4} value={contact.notes}
                    onFocus={() => startContact(contactAnalyticsFields.notes)} onChange={event => changeContact('notes', event.target.value)} placeholder="使いたい食材、作りたい味、気になることなど、分かる範囲でお知らせください。" />
            </div>
        </fieldset>
        <div className={styles.notice}>
            <p><strong>相談の送信だけで費用は発生せず、正式発注にもなりません。</strong></p>
            <p>試作へ進む場合は、内容・料金を確認したうえでご依頼いただきます。初回は2回まで5,000円（税別・税込5,500円）の先払いです。</p>
            <p>試作で特殊食材の使用の場合は別途お見積りとなります。</p>
            <details className={styles.paymentDetails}>
                <summary>初回特典・試作と製造のお支払いを確認する</summary>
                <p>試作2回まで通常10,000円→初回5,000円（50%OFF・税別）。原材料表示作成5,000円、栄養成分表示作成（計算値）5,000円、簡易パッケージデザイン30,000円は初回各0円です。</p>
                <p>初回特典は1企業（個人は1名）につき1回限り。追加試作は1回3,000円（税別）。製造代金・原料実費・送料は特典対象外です。</p>
                <ol>
                    <li>試作前：試作費5,500円（税込）を先払いし、入金確認後に開始します。試作のみで終了できます。</li>
                    <li>製造をご希望の場合：正式発注後、製造代金の50％を着手金としてお支払いいただきます。</li>
                    <li>出荷前：完成数量に合わせて精算し、製造代金の残額をお支払いいただきます。</li>
                </ol>
                <p>製造へ進む場合は、通常この3回のお支払いです。</p>
            </details>
        </div>
        {error && <p className={styles.error} role="alert">{error}</p>}
        <button className={styles.submit} type="submit" disabled={isSubmitting}>{isSubmitting ? '送信中…' : 'この内容で相談を送信する'}</button>
        <p className={styles.terms}><Link href="/btob/terms">食品OEM取引規約を確認する</Link></p>
    </form>
}
