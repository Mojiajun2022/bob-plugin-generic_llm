function supportLanguages() {
    return [
        "auto",
        "zh-Hans",
        "zh-Hant",
        "en",
        "ja",
        "ko",
        "fr",
        "de",
        "es",
        "it",
        "ru",
        "pt",
        "nl",
        "pl",
        "ar"
    ];
}

var langMap = {
    "auto": "自动检测",
    "zh-Hans": "简体中文",
    "zh-Hant": "繁體中文",
    "en": "English",
    "ja": "日本語",
    "ko": "한국어",
    "fr": "Français",
    "de": "Deutsch",
    "es": "Español",
    "it": "Italiano",
    "ru": "Русский",
    "pt": "Português",
    "nl": "Nederlands",
    "pl": "Polski",
    "ar": "العربية"
};

function parseFloatOption(value, fallback) {
    if (value === undefined || value === null || value === "") return fallback;
    var n = parseFloat(value);
    return isNaN(n) ? fallback : n;
}

function parseIntOption(value, fallback) {
    if (value === undefined || value === null || value === "") return fallback;
    var n = parseInt(value, 10);
    return isNaN(n) ? fallback : n;
}

function boolOption(name, defaultYes) {
    var defaultValue = defaultYes ? "yes" : "no";
    return (($option[name] || defaultValue) === "yes");
}

function getProviderType() {
    return String($option.providerType || "ollama");
}

function isStreamingEnabled(query) {
    var enabled = boolOption("enableStreaming", true);
    return enabled && typeof query.onStream === "function";
}

function buildHeaders() {
    var headers = {
        "Content-Type": "application/json"
    };

    var apiKey = String($option.apiKey || "").trim();
    if (apiKey) {
        if (boolOption("useBearerAuth", true)) {
            headers["Authorization"] = "Bearer " + apiKey;
        } else {
            headers["Authorization"] = apiKey;
        }
    }

    return headers;
}

function buildThinkValue() {
    return boolOption("disableThinking", true) ? false : true;
}

function shouldUseStructuredOutput() {
    return boolOption("useStructuredOutput", true);
}

function shouldPreserveFormatting() {
    return boolOption("preserveFormatting", true);
}

function shouldProtectPlaceholders() {
    return boolOption("protectPlaceholders", true);
}

function shouldRunConsistencyCheck() {
    return boolOption("consistencyCheck", false);
}

function getSpeedMode() {
    return String($option.speedMode || "balanced");
}

function getTranslationMode() {
    return String($option.translationMode || "auto_scene");
}

function getSceneContext() {
    return String($option.sceneContext || "").trim();
}

function buildFormatSchema() {
    return {
        type: "object",
        properties: {
            translation: { type: "string" }
        },
        required: ["translation"]
    };
}

function getApiUrl() {
    return String($option.apiUrl || "http://127.0.0.1:11434").replace(/\/+$/, "");
}

function getModel() {
    return String($option.model || "qwen2.5").trim();
}

function getTimeoutSec() {
    return Math.max(1, parseIntOption($option.timeoutSec, 20));
}

function getKeepAlive() {
    return String($option.keepAlive || "10m").trim();
}

function buildOptionsBySpeedMode() {
    var temperature = parseFloatOption($option.temperature, 0);
    var speedMode = getSpeedMode();

    var opts = {
        temperature: temperature
    };

    if (speedMode === "fast") {
        opts.num_predict = 512;
        opts.top_p = 0.9;
    } else if (speedMode === "quality") {
        opts.num_predict = 2048;
        opts.top_p = 0.95;
    } else {
        opts.num_predict = 1024;
        opts.top_p = 0.9;
    }

    return opts;
}

function parseGlossary() {
    var raw = String($option.glossary || "").trim();
    if (!raw) return [];

    var lines = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
    var entries = [];

    for (var i = 0; i < lines.length; i++) {
        var line = lines[i].trim();
        if (!line) continue;

        var parts = null;

        if (line.indexOf("=>") >= 0) {
            parts = line.split("=>");
        } else if (line.indexOf("=") >= 0) {
            parts = line.split("=");
        } else if (line.indexOf("：") >= 0) {
            parts = line.split("：");
        } else if (line.indexOf(":") >= 0) {
            parts = line.split(":");
        }

        if (parts && parts.length >= 2) {
            var source = String(parts[0]).trim();
            var target = String(parts.slice(1).join(" ")).trim();
            if (source && target) {
                entries.push({
                    source: source,
                    target: target
                });
            }
        }
    }

    return entries;
}

function detectScene(text) {
    var t = String(text || "");

    if (!t.trim()) return "general";

    var lines = t.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
    var shortLineCount = 0;
    var nonEmptyLineCount = 0;

    for (var i = 0; i < lines.length; i++) {
        var line = lines[i].trim();
        if (!line) continue;
        nonEmptyLineCount++;
        if (line.length <= 32) shortLineCount++;
    }

    var uiKeywords = /settings|service|services|history|favorites|plugin|plugins|general|about|integration|export|import|preferences|button|menu|toolbar|dialog|cancel|save|apply|close/i;
    var technicalKeywords = /api|json|xml|yaml|http|https|function|class|method|variable|error|exception|stack|trace|docker|kubernetes|python|javascript|typescript|java|golang|rust|sql|regex|placeholder|token|schema|endpoint|request|response|timeout/i;
    var codeLike = /[`{}[\]<>_=]|\/[A-Za-z0-9._-]+\/|[A-Za-z0-9_.-]+\.[A-Za-z]{1,6}|%s|%d|\{\{.+?\}\}|\$\{.+?\}/;

    if (uiKeywords.test(t) || (nonEmptyLineCount > 1 && shortLineCount / Math.max(nonEmptyLineCount, 1) > 0.7)) {
        return "ui";
    }

    if (technicalKeywords.test(t) || codeLike.test(t)) {
        return "technical";
    }

    return "general";
}

function resolveScene(text) {
    var mode = getTranslationMode();

    if (mode === "auto_scene") {
        return detectScene(text);
    }

    if (mode === "concise") return "concise";
    if (mode === "bilingual") return "bilingual";

    return mode;
}

function protectSegments(text) {
    var source = String(text || "");
    var placeholders = [];
    var idx = 0;

    function addToken(original) {
        var token = "__BOBPH_" + idx + "__";
        placeholders.push({
            token: token,
            value: original
        });
        idx++;
        return token;
    }

    var patterns = [
        /https?:\/\/[^\s]+/g,
        /`[^`]+`/g,
        /\{\{[^{}]+\}\}/g,
        /\$\{[^{}]+\}/g,
        /\{[A-Za-z0-9_.-]+\}/g,
        /%[sdif]/g,
        /<\/?[A-Za-z][^>]*>/g,
        /\[[^\]]+\]\([^)]+\)/g
    ];

    var protectedText = source;

    for (var i = 0; i < patterns.length; i++) {
        protectedText = protectedText.replace(patterns[i], function(m) {
            return addToken(m);
        });
    }

    return {
        text: protectedText,
        placeholders: placeholders
    };
}

function restoreProtectedSegments(text, placeholders) {
    var output = String(text || "");

    for (var i = 0; i < placeholders.length; i++) {
        var item = placeholders[i];
        var re = new RegExp(item.token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
        output = output.replace(re, item.value);
    }

    return output;
}

function buildGlossaryPrompt(glossaryEntries) {
    if (!glossaryEntries || glossaryEntries.length === 0) return "";

    var lines = [];
    lines.push("必须遵循以下术语表：");
    for (var i = 0; i < glossaryEntries.length; i++) {
        lines.push("- " + glossaryEntries[i].source + " => " + glossaryEntries[i].target);
    }
    return lines.join("\n");
}

function buildSceneInstruction(scene) {
    if (scene === "ui") {
        return [
            "这是 UI 文案翻译。",
            "要求简短、自然、符合软件界面习惯。",
            "按钮、菜单、设置项尽量精炼。"
        ].join("\n");
    }

    if (scene === "technical") {
        return [
            "这是技术文档或技术文本翻译。",
            "优先保证术语准确、一致，不要口语化。",
            "保留技术名词、参数、变量、路径、标签。"
        ].join("\n");
    }

    if (scene === "concise") {
        return [
            "请输出更简洁、更凝练的译文。",
            "在不损失原意的前提下尽量简短。"
        ].join("\n");
    }

    if (scene === "bilingual") {
        return [
            "请输出双语对照。",
            "格式固定为：原文 + 换行 + 译文。",
            "不要加解释。"
        ].join("\n");
    }

    return [
        "请进行自然、准确、通顺的翻译。",
        "不要擅自补充说明。"
    ].join("\n");
}

function buildFormatInstruction() {
    var lines = [];

    if (shouldPreserveFormatting()) {
        lines.push("尽量保留原文的段落、换行和列表结构。");
    }

    if (shouldProtectPlaceholders()) {
        lines.push("必须原样保留占位符、变量名、URL、标签、代码片段，不得翻译或改写。");
    }

    lines.push("不要输出解释、分析、注释、标题、前后缀、代码块、拼音、术语拆解。");
    lines.push("不要重复原文。");
    lines.push("只返回最终译文。");

    return lines.join("\n");
}

function buildSceneContextPrompt() {
    var sceneContext = getSceneContext();
    if (!sceneContext) return "";
    return [
        "补充场景要求：",
        sceneContext
    ].join("\n");
}

function buildUserPrompt(sourceLang, targetLang, text, scene, glossaryEntries, structured) {
    var parts = [];

    parts.push("请将下面文本从" + sourceLang + "翻译为" + targetLang + "。");
    parts.push(buildSceneInstruction(scene));

    var sceneContextPrompt = buildSceneContextPrompt();
    if (sceneContextPrompt) {
        parts.push(sceneContextPrompt);
    }

    parts.push(buildFormatInstruction());

    var glossaryPrompt = buildGlossaryPrompt(glossaryEntries);
    if (glossaryPrompt) {
        parts.push(glossaryPrompt);
    }

    if (structured) {
        parts.push("你必须只返回一个 JSON 对象，且只能包含一个字段：translation。");
        parts.push("不要输出多余字段，不要输出 markdown。");
    }

    parts.push("");
    parts.push("原文：");
    parts.push(text);

    return parts.join("\n");
}

function extractJsonTranslation(text) {
    if (!text) return "";

    try {
        var parsed = JSON.parse(text);
        if (parsed && typeof parsed.translation === "string") {
            return parsed.translation.trim();
        }
    } catch (e) {}

    var start = text.indexOf("{");
    var end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
        try {
            var sub = text.substring(start, end + 1);
            var parsed2 = JSON.parse(sub);
            if (parsed2 && typeof parsed2.translation === "string") {
                return parsed2.translation.trim();
            }
        } catch (e2) {}
    }

    return "";
}

function removeCodeFences(text) {
    var s = String(text || "").trim();
    s = s.replace(/^```(?:json|text|markdown)?\s*/i, "");
    s = s.replace(/\s*```$/i, "").trim();
    s = s.replace(/^~~~(?:json|text|markdown)?\s*/i, "");
    s = s.replace(/\s*~~~$/i, "").trim();
    return s;
}

function extractBestTranslationBlock(text) {
    var s = String(text || "");
    var codeBlockRegex = /(?:```|~~~)\s*([\s\S]*?)\s*(?:```|~~~)/g;
    var blocks = [];
    var m;

    while ((m = codeBlockRegex.exec(s)) !== null) {
        if (m[1] && String(m[1]).trim()) {
            blocks.push(String(m[1]).trim());
        }
    }

    if (blocks.length > 0) {
        return blocks[blocks.length - 1];
    }

    return "";
}

function stripLeadingNoise(text) {
    var s = String(text || "").trim();
    s = s.replace(/^Here is the translation(?: into [^:]+)?[:：]?\s*/i, "");
    s = s.replace(/^Translation[:：]?\s*/i, "");
    s = s.replace(/^译文[:：]?\s*/i, "");
    s = s.replace(/^翻译[:：]?\s*/i, "");
    s = s.replace(/^Final Answer[:：]?\s*/i, "");
    s = s.replace(/^最终答案[:：]?\s*/i, "");
    return s.trim();
}

function cutAtExplanation(text) {
    var s = String(text || "").trim();

    var stopPatterns = [
        /\n\s*\*\*Detailed Breakdown:\*\*/i,
        /\n\s*\*\*Translation Breakdown:\*\*/i,
        /\n\s*\*\*Breakdown:\*\*/i,
        /\n\s*\*\*Note:\*\*/i,
        /\n\s*\*\*Final Answer:\*\*/i,
        /\n\s*Detailed Breakdown[:：]/i,
        /\n\s*Translation Breakdown[:：]/i,
        /\n\s*Breakdown[:：]/i,
        /\n\s*Note[:：]/i,
        /\n\s*Final Answer[:：]/i,
        /\n\s*解释[:：]/i,
        /\n\s*说明[:：]/i,
        /\n\s*\*Note[:：]/i
    ];

    for (var i = 0; i < stopPatterns.length; i++) {
        var idx = s.search(stopPatterns[i]);
        if (idx >= 0) {
            s = s.substring(0, idx).trim();
            break;
        }
    }

    return s.trim();
}

function trimDanglingArtifacts(text) {
    var s = String(text || "").trim();

    if (s === "{") return "";

    s = s.replace(/\n?\{$/, "").trim();
    s = s.replace(/\s+\{$/, "").trim();

    return s;
}

function dedupeRepeatedLines(text) {
    var s = String(text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
    if (!s) return "";

    var lines = s.split("\n");
    var out = [];

    for (var i = 0; i < lines.length; i++) {
        var line = lines[i].trim();

        if (!line) {
            if (out.length > 0 && out[out.length - 1] !== "") {
                out.push("");
            }
            continue;
        }

        if (out.length > 0 && out[out.length - 1] === line) {
            continue;
        }

        out.push(line);
    }

    while (out.length > 0 && out[0] === "") out.shift();
    while (out.length > 0 && out[out.length - 1] === "") out.pop();

    return out.join("\n").trim();
}

function isChineseText(text) {
    return /[\u3400-\u9FFF\uF900-\uFAFF]/.test(String(text || ""));
}

function normalizeForCompare(text) {
    return String(text || "")
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
}

function isSameAsSource(candidate, source) {
    return normalizeForCompare(candidate) === normalizeForCompare(source);
}

function getNonEmptyLineCount(text) {
    var lines = String(text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
    var count = 0;
    for (var i = 0; i < lines.length; i++) {
        if (lines[i].trim()) count++;
    }
    return count;
}

function isShortInput(text) {
    var s = String(text || "").trim();
    if (!s) return true;

    var lineCount = getNonEmptyLineCount(s);
    var wordCount = s.split(/\s+/).filter(function(x) { return x; }).length;

    return lineCount <= 1 && wordCount <= 3 && s.length <= 40;
}

function splitCandidates(text) {
    var s = String(text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
    if (!s) return [];

    var out = [];
    out.push(s);

    var blocks = s.split(/\n{2,}/);
    for (var i = 0; i < blocks.length; i++) {
        var b = blocks[i].trim();
        if (b && out.indexOf(b) < 0) out.push(b);
    }

    var lines = s.split("\n");
    for (var j = 0; j < lines.length; j++) {
        var line = lines[j].trim();
        if (line && out.indexOf(line) < 0) out.push(line);
    }

    return out;
}

function scoreCandidate(candidate, originalText, queryFrom, queryTo) {
    var c = String(candidate || "").trim();
    if (!c) return -999999;

    var score = 0;

    if (!isSameAsSource(c, originalText)) {
        score += 100;
    } else {
        score -= 200;
    }

    var lineCount = getNonEmptyLineCount(c);
    score += lineCount * 10;
    score += Math.min(c.length, 500) / 10;

    var targetIsChinese = (queryTo === "zh-Hans" || queryTo === "zh-Hant");
    if (targetIsChinese && isChineseText(c)) {
        score += 50;
    }

    var originalLineCount = getNonEmptyLineCount(originalText);
    if (originalLineCount > 1 && lineCount > 1) {
        score += 80;
    }

    if (String(originalText || "").length > 50 && c.length < 12) {
        score -= 80;
    }

    return score;
}

function selectBestCandidate(text, originalText, queryFrom, queryTo) {
    var cleaned = trimDanglingArtifacts(dedupeRepeatedLines(text));
    if (!cleaned) return "";

    var candidates = splitCandidates(cleaned);
    if (candidates.length === 0) return cleaned;

    var shortInput = isShortInput(originalText);
    var targetIsChinese = (queryTo === "zh-Hans" || queryTo === "zh-Hant");

    var filtered = [];
    for (var i = 0; i < candidates.length; i++) {
        var c = candidates[i];
        if (!isSameAsSource(c, originalText)) {
            filtered.push(c);
        }
    }

    if (filtered.length === 0) {
        filtered = candidates.slice();
    }

    if (shortInput && targetIsChinese) {
        for (var j = 0; j < filtered.length; j++) {
            if (isChineseText(filtered[j])) {
                return filtered[j];
            }
        }
    }

    var best = filtered[0];
    var bestScore = scoreCandidate(best, originalText, queryFrom, queryTo);

    for (var k = 1; k < filtered.length; k++) {
        var candidate = filtered[k];
        var score = scoreCandidate(candidate, originalText, queryFrom, queryTo);
        if (score > bestScore) {
            best = candidate;
            bestScore = score;
        }
    }

    return best;
}

function cleanupTranslation(text, originalText, queryFrom, queryTo) {
    var s = String(text || "").trim();
    if (!s) return "";

    var jsonTranslation = extractJsonTranslation(s);
    if (jsonTranslation) {
        return selectBestCandidate(jsonTranslation, originalText, queryFrom, queryTo);
    }

    var blockTranslation = extractBestTranslationBlock(s);
    if (blockTranslation) {
        return selectBestCandidate(blockTranslation, originalText, queryFrom, queryTo);
    }

    s = removeCodeFences(s);
    s = stripLeadingNoise(s);
    s = cutAtExplanation(s);

    var introPatterns = [
        /^Here is the translation(?: into [^:]+)?[:：]?\s*/i,
        /^Below is the translation[:：]?\s*/i
    ];

    for (var i = 0; i < introPatterns.length; i++) {
        s = s.replace(introPatterns[i], "");
    }

    s = trimDanglingArtifacts(s);
    return selectBestCandidate(s, originalText, queryFrom, queryTo);
}

function extractGenericContent(data) {
    try {
        if (data && data.choices && data.choices.length > 0) {
            var c = data.choices[0].message.content;
            if (typeof c === "string") return c;
            if (Array.isArray(c)) {
                var parts = [];
                for (var i = 0; i < c.length; i++) {
                    var item = c[i];
                    if (item && item.type === "text" && item.text) {
                        parts.push(item.text);
                    }
                }
                return parts.join("\n");
            }
        }
    } catch (e) {}
    return "";
}

function emitStream(query, text) {
    if (typeof query.onStream !== "function") return;

    query.onStream({
        result: {
            from: query.from,
            to: query.to,
            toParagraphs: [String(text || "")]
        }
    });
}

function buildPrimaryRequestBody(sourceLang, targetLang, protectedText, scene, glossaryEntries, streaming) {
    var providerType = getProviderType();
    var structured = shouldUseStructuredOutput() && !streaming;
    var userContent = buildUserPrompt(sourceLang, targetLang, protectedText, scene, glossaryEntries, structured);

    if (providerType === "generic") {
        var body = {
            model: getModel(),
            temperature: parseFloatOption($option.temperature, 0),
            stream: streaming,
            messages: [
                {
                    role: "system",
                    content: String($option.systemPrompt || "你是一个专业翻译引擎，不是聊天助手。你的任务是把用户提供的原文翻译成目标语言。禁止输出解释、分析、注释、标题、前后缀、代码块、示例、拼音、术语拆解。只返回译文本身。")
                },
                {
                    role: "user",
                    content: userContent
                }
            ]
        };

        if (structured) {
            body.response_format = {
                type: "json_schema",
                json_schema: {
                    name: "translation_result",
                    schema: buildFormatSchema()
                }
            };
        }

        return body;
    }

    var ollamaBody = {
        model: getModel(),
        stream: streaming,
        think: buildThinkValue(),
        keep_alive: getKeepAlive(),
        options: buildOptionsBySpeedMode(),
        messages: [
            {
                role: "system",
                content: String($option.systemPrompt || "你是一个专业翻译引擎，不是聊天助手。你的任务是把用户提供的原文翻译成目标语言。禁止输出解释、分析、注释、标题、前后缀、代码块、示例、拼音、术语拆解。只返回译文本身。")
            },
            {
                role: "user",
                content: userContent
            }
        ]
    };

    if (structured) {
        ollamaBody.format = buildFormatSchema();
    }

    return ollamaBody;
}

function buildConsistencyRequestBody(sourceLang, targetLang, originalText, translatedText, scene, glossaryEntries, query) {
    var providerType = getProviderType();
    var glossaryPrompt = buildGlossaryPrompt(glossaryEntries);
    var sceneContextPrompt = buildSceneContextPrompt();

    var targetLangCode = query.to || "";
    var sourceLangCode = query.from || "";

    var checkPrompt = [
        "你正在执行翻译结果复检，而不是重新自由翻译。",
        "请检查下面译文是否存在以下问题：",
        "1. 术语表未遵循",
        "2. 占位符、变量名、URL、标签被改坏",
        "3. 译文不够符合场景要求",
        "4. 译文不符合补充场景要求",
        "5. 重复、解释、说明性废话",
        "6. 末尾多余的孤立符号，例如 {",
        "7. 输出其实还是原文，没有真正翻译",
        "",
        "【强约束】",
        "原文语言：" + sourceLang + " (" + sourceLangCode + ")",
        "目标语言：" + targetLang + " (" + targetLangCode + ")",
        "无论是否修正，最终 translation 字段必须严格使用目标语言输出。",
        "绝对不要把译文改成中文，除非目标语言本身就是中文。",
        "绝对不要把译文改成其他语言。",
        "不要输出解释，不要输出说明，不要输出原文。",
        "",
        "如果译文已经合格，请原样返回。",
        "如果不合格，请只输出修正后的最终译文。",
        "你必须只返回一个 JSON 对象，且只能包含一个字段：translation。",
        "",
        "场景：" + scene,
        sceneContextPrompt ? sceneContextPrompt : "",
        glossaryPrompt ? glossaryPrompt : "",
        "",
        "原文：",
        originalText,
        "",
        "当前译文：",
        translatedText
    ].join("\n");

    if (providerType === "generic") {
        return {
            model: getModel(),
            temperature: 0,
            response_format: {
                type: "json_schema",
                json_schema: {
                    name: "translation_result",
                    schema: buildFormatSchema()
                }
            },
            messages: [
                {
                    role: "system",
                    content: "You are a translation quality checker. You must preserve the target language exactly. Return only the final corrected translation in the target language, inside the translation field."
                },
                {
                    role: "user",
                    content: checkPrompt
                }
            ]
        };
    }

    return {
        model: getModel(),
        stream: false,
        think: false,
        keep_alive: getKeepAlive(),
        options: {
            temperature: 0
        },
        format: buildFormatSchema(),
        messages: [
            {
                role: "system",
                content: "You are a translation quality checker. You must preserve the target language exactly. Return only the final corrected translation in the target language, inside the translation field."
            },
            {
                role: "user",
                content: checkPrompt
            }
        ]
    };
}

function parseOllamaStreamBuffer(bufferObj, onDelta) {
    var buffer = bufferObj.value;
    var lines = buffer.split("\n");
    bufferObj.value = lines.pop();

    for (var i = 0; i < lines.length; i++) {
        var line = lines[i].trim();
        if (!line) continue;

        try {
            var obj = JSON.parse(line);
            if (obj && obj.message && typeof obj.message.content === "string") {
                if (obj.message.content) onDelta(obj.message.content, obj);
            } else if (obj && typeof obj.response === "string") {
                if (obj.response) onDelta(obj.response, obj);
            }
        } catch (e) {}
    }
}

function flushOllamaBuffer(bufferObj, onDelta) {
    if (!bufferObj.value) return;
    try {
        var obj = JSON.parse(bufferObj.value.trim());
        if (obj && obj.message && typeof obj.message.content === "string") {
            if (obj.message.content) onDelta(obj.message.content, obj);
        } else if (obj && typeof obj.response === "string") {
            if (obj.response) onDelta(obj.response, obj);
        }
    } catch (e) {}
    bufferObj.value = "";
}

function parseGenericSSEBuffer(bufferObj, onDelta) {
    var buffer = bufferObj.value;
    var events = buffer.split("\n\n");
    bufferObj.value = events.pop();

    for (var i = 0; i < events.length; i++) {
        var evt = events[i];
        if (!evt) continue;

        var lines = evt.split("\n");
        for (var j = 0; j < lines.length; j++) {
            var line = lines[j].trim();
            if (line.indexOf("data:") !== 0) continue;

            var payload = line.substring(5).trim();
            if (!payload || payload === "[DONE]") continue;

            try {
                var obj = JSON.parse(payload);
                var delta = "";

                if (
                    obj &&
                    obj.choices &&
                    obj.choices[0] &&
                    obj.choices[0].delta &&
                    typeof obj.choices[0].delta.content === "string"
                ) {
                    delta = obj.choices[0].delta.content;
                } else if (
                    obj &&
                    obj.choices &&
                    obj.choices[0] &&
                    obj.choices[0].message &&
                    typeof obj.choices[0].message.content === "string"
                ) {
                    delta = obj.choices[0].message.content;
                }

                if (delta) onDelta(delta, obj);
            } catch (e) {}
        }
    }
}

function flushGenericBuffer(bufferObj, onDelta) {
    if (!bufferObj.value) return;
    parseGenericSSEBuffer({ value: bufferObj.value + "\n\n" }, onDelta);
    bufferObj.value = "";
}

function callProviderNonStream(requestBody, callback) {
    var providerType = getProviderType();
    var url = providerType === "generic"
        ? getApiUrl() + "/chat/completions"
        : getApiUrl() + "/api/chat";

    $http.request({
        method: "POST",
        url: url,
        timeout: getTimeoutSec(),
        header: buildHeaders(),
        body: requestBody,
        handler: function(resp) {
            if (resp.error) {
                callback({
                    type: "network",
                    message: "请求失败",
                    addition: resp.error.message || JSON.stringify(resp.error)
                }, null, null);
                return;
            }

            var data = resp.data;
            var content = "";

            try {
                if (providerType === "generic") {
                    content = extractGenericContent(data);
                } else {
                    if (data && data.message && data.message.content) {
                        content = String(data.message.content);
                    } else if (data && data.response) {
                        content = String(data.response);
                    }
                }
            } catch (e) {}

            if (!content && content !== "") {
                callback({
                    type: "api",
                    message: "接口返回格式不正确",
                    addition: JSON.stringify(data)
                }, null, data);
                return;
            }

            callback(null, content, data);
        }
    });
}

function callProviderStream(query, requestBody, callback) {
    var providerType = getProviderType();
    var url = providerType === "generic"
        ? getApiUrl() + "/chat/completions"
        : getApiUrl() + "/api/chat";

    var bufferObj = { value: "" };
    var accumulated = "";

    $http.streamRequest({
        method: "POST",
        url: url,
        timeout: getTimeoutSec(),
        cancelSignal: query.cancelSignal,
        header: buildHeaders(),
        body: requestBody,
        streamHandler: function(stream) {
            var chunk = "";

            if (typeof stream.text === "string") {
                chunk = stream.text;
            } else if (typeof stream.data === "string") {
                chunk = stream.data;
            } else if (typeof stream.raw === "string") {
                chunk = stream.raw;
            }

            if (!chunk) return;

            bufferObj.value += chunk;

            if (providerType === "generic") {
                parseGenericSSEBuffer(bufferObj, function(delta) {
                    accumulated += delta;
                    emitStream(query, accumulated);
                });
            } else {
                parseOllamaStreamBuffer(bufferObj, function(delta) {
                    accumulated += delta;
                    emitStream(query, accumulated);
                });
            }
        },
        handler: function(resp) {
            if (resp.error) {
                callback({
                    type: "network",
                    message: "请求失败",
                    addition: resp.error.message || JSON.stringify(resp.error)
                }, null, null);
                return;
            }

            if (providerType === "generic") {
                flushGenericBuffer(bufferObj, function(delta) {
                    accumulated += delta;
                });
            } else {
                flushOllamaBuffer(bufferObj, function(delta) {
                    accumulated += delta;
                });
            }

            if (!String(accumulated || "").trim()) {
                var fallbackBody = JSON.parse(JSON.stringify(requestBody));
                fallbackBody.stream = false;

                if (getProviderType() === "ollama" && shouldUseStructuredOutput()) {
                    fallbackBody.format = buildFormatSchema();
                }
                if (getProviderType() === "generic" && shouldUseStructuredOutput()) {
                    fallbackBody.response_format = {
                        type: "json_schema",
                        json_schema: {
                            name: "translation_result",
                            schema: buildFormatSchema()
                        }
                    };
                }

                callProviderNonStream(fallbackBody, callback);
                return;
            }

            callback(null, accumulated, null);
        }
    });
}

function callPrimaryProvider(query, requestBody, streaming, callback) {
    if (streaming) {
        callProviderStream(query, requestBody, callback);
    } else {
        callProviderNonStream(requestBody, callback);
    }
}

function runPrimaryTranslation(query, sourceLang, targetLang, rawText, scene, glossaryEntries, callback) {
    var protectedPayload = shouldProtectPlaceholders() ? protectSegments(rawText) : { text: rawText, placeholders: [] };
    var protectedText = protectedPayload.text;
    var streaming = isStreamingEnabled(query);

    var requestBody = buildPrimaryRequestBody(sourceLang, targetLang, protectedText, scene, glossaryEntries, streaming);

    callPrimaryProvider(query, requestBody, streaming, function(err, content, rawData) {
        if (err) {
            callback(err, null, rawData);
            return;
        }

        var resultText = cleanupTranslation(content, protectedText, query.from, query.to);

        if (shouldProtectPlaceholders()) {
            resultText = restoreProtectedSegments(resultText, protectedPayload.placeholders);
        }

        callback(null, resultText, rawData);
    });
}

function runConsistencyCheck(sourceLang, targetLang, originalText, translatedText, scene, glossaryEntries, query, callback) {
    if (!shouldRunConsistencyCheck()) {
        callback(null, translatedText, null);
        return;
    }

    var requestBody = buildConsistencyRequestBody(
        sourceLang,
        targetLang,
        originalText,
        translatedText,
        scene,
        glossaryEntries,
        query
    );

    callProviderNonStream(requestBody, function(err, content, rawData) {
        if (err) {
            callback(null, translatedText, rawData);
            return;
        }

        var revised = cleanupTranslation(content, originalText, query.from, query.to);
        if (!revised) {
            callback(null, translatedText, rawData);
            return;
        }

        callback(null, revised, rawData);
    });
}

function formatFinalOutput(scene, originalText, translatedText) {
    if (scene === "bilingual") {
        return String(originalText || "").trim() + "\n" + String(translatedText || "").trim();
    }
    return String(translatedText || "").trim();
}

function completeSuccess(query, completion, text) {
    var payload = {
        result: {
            from: query.from,
            to: query.to,
            toParagraphs: [text]
        }
    };

    if (typeof query.onCompletion === "function") {
        query.onCompletion(payload);
    } else {
        completion(payload);
    }
}

function completeError(query, completion, err) {
    var payload = { error: err };

    if (typeof query.onCompletion === "function") {
        query.onCompletion(payload);
    } else {
        completion(payload);
    }
}

function translate(query, completion) {
    var sourceLang = langMap[query.from] || "自动检测";
    var targetLang = langMap[query.to] || query.to;
    var originalText = String(query.text || "");
    var glossaryEntries = parseGlossary();
    var scene = resolveScene(originalText);

    runPrimaryTranslation(query, sourceLang, targetLang, originalText, scene, glossaryEntries, function(err, translatedText, rawData) {
        if (err) {
            completeError(query, completion, err);
            return;
        }

        if (!translatedText) {
            completeError(query, completion, {
                type: "api",
                message: "未能提取译文",
                addition: rawData ? JSON.stringify(rawData) : ""
            });
            return;
        }

        runConsistencyCheck(
            sourceLang,
            targetLang,
            originalText,
            translatedText,
            scene,
            glossaryEntries,
            query,
            function(_checkErr, finalTranslation) {
                var finalOutput = formatFinalOutput(scene, originalText, finalTranslation);
                completeSuccess(query, completion, finalOutput);
            }
        );
    });
}