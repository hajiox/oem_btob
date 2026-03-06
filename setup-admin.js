const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const env = fs.readFileSync('.env.local', 'utf8').split('\n').reduce((acc, line) => {
    const [key, ...values] = line.split('=');
    if (key && values.length > 0) {
        acc[key.trim()] = values.join('=').trim();
    }
    return acc;
}, {});

const supabase = createClient(
    env['NEXT_PUBLIC_SUPABASE_URL'],
    env['SUPABASE_SERVICE_ROLE_KEY'],
    {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    }
);

async function createAdmin() {
    console.log('🔹 管理者ユーザーを作成しています...');
    const email = 'staff@aizu-tv.com';
    const password = 'WAmas0831';

    const { data, error } = await supabase.auth.admin.createUser({
        email: email,
        password: password,
        email_confirm: true // メール確認をスキップ
    });

    if (error) {
        if (error.message.includes('already exists')) {
            console.log('✅ 管理者ユーザーは既に存在します:', email);
        } else {
            console.error('❌ ユーザー作成エラー:', error.message);
        }
    } else {
        console.log('✅ 管理者ユーザーが作成されました！');
        console.log(`📧 メール: ${email}`);
        console.log(`🔑 パスワード: ${password}`);
    }
}

createAdmin();
