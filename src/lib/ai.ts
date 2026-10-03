
// Helper to strip HTML tags
const stripHtml = (html: string): string => {
    const tmp = document.createElement('DIV')
    tmp.innerHTML = html
    return tmp.textContent || tmp.innerText || ''
}

// Cache for available models
let cachedAvailableModels: string[] | null = null
let cacheExpiry = 0

// Track which models hit rate limit (model -> timestamp when it will be available again)
const rateLimitedModels: Record<string, number> = {}

// Fetch available models from API with timeout
const fetchAvailableModels = async (apiKey: string): Promise<string[]> => {
    // Use cache if valid (5 minutes)
    if (cachedAvailableModels && Date.now() < cacheExpiry) {
        return cachedAvailableModels
    }

    try {
        // Add 5 second timeout for listing models
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 5000)

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`, {
            signal: controller.signal
        })

        clearTimeout(timeoutId)

        if (!response.ok) {
            console.warn('Could not list models:', response.status)
            return []
        }

        const data = await response.json()
        if (!data.models) return []

        // Filter models that support generateContent
        const models = data.models
            .filter((m: any) => m.supportedGenerationMethods?.includes('generateContent'))
            .map((m: any) => m.name.replace('models/', ''))
            .filter((name: string) => name.includes('gemini'))

        console.log('Available Gemini models:', models)

        cachedAvailableModels = models
        cacheExpiry = Date.now() + 5 * 60 * 1000 // 5 minute cache

        return models
    } catch (e: any) {
        if (e.name === 'AbortError') {
            console.warn('ListModels timeout - using defaults')
        } else {
            console.warn('Failed to fetch model list:', e)
        }
        // Return common defaults when we can't fetch list
        return ['gemini-2.0-flash-exp', 'gemini-1.5-flash', 'gemini-pro']
    }
}

// Preferred models in order (will be filtered by available)
const PREFERRED_ORDER = [
    'gemini-2.0-flash-exp',
    'gemini-2.0-flash',
    'gemini-exp-1206',
    'gemini-2.0-flash-thinking-exp-1219',
    'gemini-1.5-flash',
    'gemini-1.5-flash-latest',
    'gemini-1.5-flash-8b',
    'gemini-1.5-pro',
    'gemini-1.5-pro-latest',
    'gemini-pro',
    'gemini-1.0-pro'
]

// Mark a model as rate limited
const markModelRateLimited = (model: string, retryAfterSeconds: number = 60) => {
    rateLimitedModels[model] = Date.now() + (retryAfterSeconds * 1000)
    console.log(`Model ${model} rate limited until ${new Date(rateLimitedModels[model]).toLocaleTimeString()}`)
}

// Call a specific model with timeout
const callSingleModel = async (apiKey: string, model: string, prompt: string, systemInstruction?: string): Promise<string> => {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`

    const body: any = {
        contents: [{
            parts: [{ text: prompt }]
        }],
        safetySettings: [
            { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' }
        ],
        generationConfig: {
            temperature: 0.7
        }
    }

    if (systemInstruction) {
        body.systemInstruction = {
            parts: [{ text: systemInstruction }]
        }
    }

    // Add 15 second timeout
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 15000)

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body),
            signal: controller.signal
        })

        clearTimeout(timeoutId)

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}))
            throw new Error(`API Error ${response.status}: ${JSON.stringify(errorData)}`)
        }

        const data = await response.json()

        if (!data.candidates || data.candidates.length === 0) {
            throw new Error('No candidates returned')
        }

        const candidate = data.candidates[0]
        if (candidate.finishReason && candidate.finishReason !== 'STOP') {
            throw new Error(`Generation stopped: ${candidate.finishReason}`)
        }

        if (!candidate.content || !candidate.content.parts || candidate.content.parts.length === 0) {
            throw new Error('Empty content')
        }

        console.log(`✓ Model ${model} succeeded`)
        return candidate.content.parts[0].text
    } catch (e: any) {
        clearTimeout(timeoutId)
        if (e.name === 'AbortError') {
            throw new Error(`Timeout: Model ${model} yanıt vermedi (15s)`)
        }
        throw e
    }
}

// Direct REST API Call Helper - tries available models
const callGeminiAPI = async (apiKey: string, prompt: string, systemInstruction?: string): Promise<string> => {
    const available = await fetchAvailableModels(apiKey)

    if (available.length === 0) {
        throw new Error('API Anahtarı için kullanılabilir model bulunamadı. Anahtarınızı kontrol edin.')
    }

    let lastError: Error | null = null
    const now = Date.now()

    // Try preferred models first, then any available
    const modelsToTry: string[] = []

    // Add preferred models that are available
    for (const preferred of PREFERRED_ORDER) {
        const match = available.find(m => m === preferred || m.includes(preferred))
        if (match && !modelsToTry.includes(match)) {
            modelsToTry.push(match)
        }
    }

    // Add remaining available models
    for (const model of available) {
        if (!modelsToTry.includes(model)) {
            modelsToTry.push(model)
        }
    }

    for (const model of modelsToTry) {
        // Skip rate-limited models
        const rateLimitExpiry = rateLimitedModels[model] || 0
        if (now < rateLimitExpiry) {
            console.log(`Skipping ${model} - rate limited`)
            continue
        }

        try {
            console.log(`Trying model: ${model}`)
            const result = await callSingleModel(apiKey, model, prompt, systemInstruction)
            return result
        } catch (e: any) {
            console.warn(`Model ${model} failed:`, e.message)
            lastError = e

            // If rate limited, mark it and continue to next model
            if (e.message?.includes('429') || e.message?.includes('rate limit') || e.message?.includes('quota') || e.message?.includes('RESOURCE_EXHAUSTED')) {
                const retryMatch = e.message.match(/retry in (\d+)/i)
                const retrySeconds = retryMatch ? parseInt(retryMatch[1]) : 60
                markModelRateLimited(model, retrySeconds)
                continue
            }

            // For 404, model doesn't exist - remove from cache
            if (e.message?.includes('404')) {
                cachedAvailableModels = cachedAvailableModels?.filter(m => m !== model) || null
                continue
            }
        }
    }

    // All models failed
    throw lastError || new Error('Tüm AI modelleri başarısız oldu veya kota aşıldı.')
}

export const generateNotificationContent = async (
    bookTitle: string,
    pageContent: string,
    promptStyle: 'short_quote' | 'summary_quote' | 'trivia' = 'short_quote',
    isOttoman: boolean = false
): Promise<{ title: string, body: string, originalText?: string } | null> => {
    const apiKey = localStorage.getItem('google_api_key')
    if (!apiKey) {
        console.log('No API key set')
        return null
    }

    // Strip HTML to give clean text to AI
    const cleanContent = stripHtml(pageContent)

    try {
        let systemInstruction = ''
        let userPrompt = ''

        if (isOttoman) {
            systemInstruction = `Sen bir Osmanlıca uzmanısın. Görevin verilen Osmanlıca metni analiz edip, okuyucuya hem orijinalini hem de Türkçe açıklamasını sunmak.`
            userPrompt = `
            Aşağıdaki metin "${bookTitle}" kitabından bir sayfadır (Osmanlıca).
            
            Lütfen şu formatta bir bildirim içeriği hazırla:
            1. Başlık: Kitabın adını veya konuyu özetleyen kısa bir başlık.
            2. İçerik: 
               - Önce metinden kısa, çarpıcı bir orijinal cümle alıntısı yap.
               - Hemen altına parantez içinde veya tire ile Türkçe mealini/anlamını yaz.
               - En sona okuyucuyu meraklandıracak kısa bir not ekle.
            3. Orijinal Metin: Seçtiğin orijinal Osmanlıca cümleyi ayrıca belirt (vurgulama için kullanılacak).
            
            Metin:
            ${cleanContent.substring(0, 1500)}
            `
        } else {
            switch (promptStyle) {
                case 'trivia':
                    systemInstruction = `Sen merak uyandıran bir kütüphanecisin. Kitaplardan ilginç "Biliyor muydun?" bilgileri çıkarırsın.`
                    userPrompt = `
                    Aşağıdaki metin "${bookTitle}" kitabından bir sayfadır.
                    Lütfen bu sayfadaki bilgilerden yola çıkarak bir "Biliyor muydun?" tarzı bildirim hazırla.
                    Metin: ${cleanContent.substring(0, 2000)}
                    `
                    break;
                case 'summary_quote':
                    systemInstruction = `Sen bilge bir editörsün. Kitap sayfalarını özetleyip en can alıcı alıntıyı seçersin.`
                    userPrompt = `
                    Aşağıdaki metin "${bookTitle}" kitabından bir sayfadır.
                    Lütfen bu sayfanın ana fikrini bir cümleyle özetle ve bu fikri destekleyen en güzel alıntıyı seç.
                    Metin: ${cleanContent.substring(0, 2000)}
                    `
                    break;
                case 'short_quote':
                default:
                    systemInstruction = `Sen insanlara ilham veren bir rehbersin. Kitaplardan en etkileyici cümleleri seçersin.`
                    userPrompt = `
                    Aşağıdaki metin "${bookTitle}" kitabından bir sayfadır.
                    Lütfen bu sayfadan en etkileyici, düşündürücü veya ilham verici cümleyi seç.
                    Metin: ${cleanContent.substring(0, 2000)}
                    `
                    break;
            }
        }

        userPrompt += `
        Lütfen yanıtını SADECE şu JSON formatında ver:
        {
            "title": "...",
            "body": "...",
            "originalText": "..." (Sadece Osmanlıca modunda dolu olacak, diğerlerinde boş bırak)
        }
        `

        // Try to call AI
        let text = ''
        try {
            text = await callGeminiAPI(apiKey, userPrompt, systemInstruction)
        } catch (e) {
            console.warn('AI generation failed', e)
            return null // Let the caller use fallback
        }

        // Parse JSON
        try {
            const jsonMatch = text.match(/\{[\s\S]*\}/)
            if (jsonMatch) {
                const json = JSON.parse(jsonMatch[0])
                return {
                    title: json.title || bookTitle,
                    body: json.body || 'İçerik oluşturulamadı.',
                    originalText: json.originalText
                }
            } else {
                return {
                    title: bookTitle,
                    body: text.trim().substring(0, 200)
                }
            }
        } catch (e) {
            console.error('AI JSON Parse Error', e)
            return {
                title: bookTitle,
                body: text.trim().substring(0, 200)
            }
        }

    } catch (error) {
        console.error('AI Generation Error:', error)
        return null
    }
}

// Fallback helper - Enhanced smart sentence extraction
export const extractRandomSentence = (text: string): string | null => {
    const cleanText = stripHtml(text)
    const sentences = cleanText.match(/[^.!?]+[.!?]+/g)
    if (!sentences || sentences.length === 0) return null

    const validSentences = sentences
        .map(s => s.trim())
        .filter(s => {
            if (s.length < 50 || s.length > 300) return false
            if (!/^[A-ZÇĞİÖŞÜa-zçğıöşü]/.test(s)) return false
            if (s.split(/\s+/).length < 5) return false
            if (/^(ve|veya|ama|fakat|ancak|çünkü|ki|de|da)/i.test(s)) return false
            return true
        })

    if (validSentences.length === 0) {
        const fallbackSentences = sentences.filter(s => s.trim().length > 30 && s.trim().length < 400)
        if (fallbackSentences.length === 0) return null
        return fallbackSentences[Math.floor(Math.random() * fallbackSentences.length)].trim()
    }

    return validSentences[Math.floor(Math.random() * validSentences.length)]
}

export const summarizeText = async (text: string): Promise<string | null> => {
    const apiKey = localStorage.getItem('google_api_key')
    if (!apiKey) return null

    try {
        const prompt = `Aşağıdaki metni 2-3 cümleyle özetle:\n\n${text.substring(0, 3000)}`
        const result = await callGeminiAPI(apiKey, prompt)
        return result
    } catch (error) {
        console.error('AI Summarization Error:', error)
        return null
    }
}
