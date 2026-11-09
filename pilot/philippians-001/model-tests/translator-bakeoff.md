# Model bake-off: bakeoff-001

Same passages, same prompts, same glossary. Every candidate judged in one anonymized review per reviewer (auditor: claude-opus-5-5; scorer: minimax/minimax-m3.1-flash). Nothing here is accepted into the edition.

"Clean" means: passed the code checks, and both reviewers passed it on meaning (G1) and pronoun number (G2).

| Rank | Role · model | Clean | Auditor meaning pass | Checks first try | Checks after repair | Scorer avg | Cost | $/passage | Avg seconds | Errors |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | clarity·minimax-m3.1-flash | 4/7 | 4/7 | 5/7 | 6/7 | 0.910 | $0.0138 | $0.0020 | 23 | 0 |
| 2 | clarity·ling-3.0-flash | 3/7 | 3/7 | 6/7 | 6/7 | 0.935 | $0.0066 | $0.0009 | 39 | 0 |
| 3 | cadence·ling-3.0-flash | 3/7 | 3/7 | 6/7 | 7/7 | 0.933 | $0.0076 | $0.0011 | 42 | 0 |
| 4 | clarity·glm-5.3 | 3/7 | 3/7 | 4/7 | 7/7 | 0.912 | $0.0208 | $0.0030 | 15 | 0 |
| 5 | cadence·glm-5.3 | 2/7 | 2/7 | 5/7 | 7/7 | 0.940 | $0.0210 | $0.0030 | 14 | 0 |
| 6 | cadence·nemotron-3.5-super-vl | 2/7 | 2/7 | 6/7 | 7/7 | 0.935 | $0.0370 | $0.0053 | 129 | 0 |
| 7 | minimalist·deepseek-v4.1-flash | 2/7 | 2/7 | 7/7 | 7/7 | 0.928 | $0.0134 | $0.0019 | 29 | 0 |
| 8 | clarity·llama-3.1-8b-instruct | 0/7 | 0/7 | 0/7 | 0/7 | n/a | $0.0000 | $0.0000 | 15 | 7 |
| 9 | cadence·llama-3.1-8b-instruct | 0/7 | 0/7 | 0/7 | 0/7 | n/a | $0.0011 | $0.0002 | 25 | 7 |

## Contested verses, as each model rendered them

### Philippians 1:8

KJV: For God is my record, how greatly I long after you all in the bowels of Jesus Christ.

- **minimalist·deepseek-v4.1-flash**: For God is my witness, how greatly I long after you all in the affection of Jesus Christ.
- **clarity·minimax-m3.1-flash**: For God is my witness, how greatly I long after you all in the affection of Jesus Christ.
- **clarity·ling-3.0-flash**: For God is my witness, how greatly I long after you all in the affection of Jesus Christ.
- **clarity·glm-5.3**: For God is my witness, how greatly I long after you all in the affection of Jesus Christ.
- **cadence·nemotron-3.5-super-vl**: For God is my witness, how greatly I long after you all in the affection of Jesus Christ.
- **cadence·ling-3.0-flash**: For God is my witness, how greatly I long after you all in the affection of Jesus Christ.
- **cadence·glm-5.3**: For God is my witness, how greatly I long after you all in the affection of Jesus Christ.

### Philippians 2:6

KJV: Who, being in the form of God, thought it not robbery to be equal with God:

- **minimalist·deepseek-v4.1-flash**: Who, being in the form of God, thought it not robbery to be equal with God:
- **clarity·minimax-m3.1-flash**: Who, being in the form of God, thought it not robbery to be equal with God:
- **clarity·ling-3.0-flash**: Who, being in the form of God, thought it not robbery to be equal with God:
- **clarity·glm-5.3**: Who, being in the form of God, thought it not robbery to be equal with God:
- **cadence·nemotron-3.5-super-vl**: Who, being in the form of God, thought it not robbery to be equal with God:
- **cadence·ling-3.0-flash**: Who, being in the form of God, thought it not seizure to be equal with God:
- **cadence·glm-5.3**: Who, being in the form of God, thought it not robbery to be equal with God:

### Philippians 2:8

KJV: And being found in fashion as a man, he humbled himself, and became obedient unto death, even the death of the cross.

- **minimalist·deepseek-v4.1-flash**: And being found in fashion as a man, he humbled himself, and became obedient to death, even the death of the cross.
- **clarity·minimax-m3.1-flash**: And being found in appearance as a man, he humbled himself, and became obedient to death, even the death of the cross.
- **clarity·ling-3.0-flash**: And being found in fashion as a man, he humbled himself, and became obedient to death, even the death of the cross.
- **clarity·glm-5.3**: And being found in fashion as a man, he humbled himself, and became obedient to death, even the death of the cross.
- **cadence·nemotron-3.5-super-vl**: And being found in fashion as a man, he humbled himself, and became obedient to death, even the death of the cross.
- **cadence·ling-3.0-flash**: And being found in fashion as a man, he humbled himself, and became obedient to death, even the death of the cross.
- **cadence·glm-5.3**: And being found in fashion as a man, he humbled himself, and became obedient to death, even the death of the cross.

### Philippians 2:20

KJV: For I have no man likeminded, who will naturally care for your state.

- **minimalist·deepseek-v4.1-flash**: For I have no man likeminded, who will sincerely care for your state.
- **clarity·minimax-m3.1-flash**: For I have no man like-minded, who will sincerely care for your state.
- **clarity·ling-3.0-flash**: For I have no man likeminded, who will naturally care for your state.
- **clarity·glm-5.3**: For I have no man likeminded, who will genuinely care for your state.
- **cadence·nemotron-3.5-super-vl**: For I have no man likeminded, who will genuinely care for your state.
- **cadence·ling-3.0-flash**: For I have no man likeminded, who will naturally care for your state.
- **cadence·glm-5.3**: For I have no man likeminded, who will sincerely care for your state.

### Philippians 2:30

KJV: Because for the work of Christ he was nigh unto death, not regarding his life, to supply your lack of service toward me.

- **minimalist·deepseek-v4.1-flash**: Because for the work of Christ he was nigh to death, not regarding his life, to supply your lack of service toward me.
- **clarity·minimax-m3.1-flash**: Because for the work of Christ he was close to death, not risking his life, to supply your lack of service toward me.
- **clarity·ling-3.0-flash**: Because for the work of Christ he was nigh to death, not regarding his life, to supply your lack of service toward me.
- **clarity·glm-5.3**: Because for the work of Christ he was near to death, not sparing his life, to supply your lack of service toward me.
- **cadence·nemotron-3.5-super-vl**: Because for the work of Christ he was nigh to death, not caring for his life, to supply your lack of service toward me.
- **cadence·ling-3.0-flash**: Because for the work of Christ he was nigh to death, not regarding his life, to supply your lack of service toward me.
- **cadence·glm-5.3**: Because for the work of Christ he was near to death, not regarding his life, to supply your lack of service toward me.

### Philippians 3:12

KJV: Not as though I had already attained, either were already perfect: but I follow after, if that I may apprehend that for which also I am apprehended of Christ Jesus.

- **minimalist·deepseek-v4.1-flash**: Not as though I had already attained, either were already perfect: but I follow after, if that I may grasp that for which also I am grasped by Christ Jesus.
- **clarity·minimax-m3.1-flash**: Not as though I had already attained, or were already perfect: but I follow after, if that I may grasp that for which also I am grasped by Christ Jesus.
- **clarity·ling-3.0-flash**: Not as though I had already attained, either were already perfect: but I follow after, if that I may grasp that for which also I am grasped by Christ Jesus.
- **clarity·glm-5.3**: Not as though I had already attained, either were already perfect: but I follow after, if that I may grasp that for which also I am grasped by Christ Jesus.
- **cadence·nemotron-3.5-super-vl**: Not as though I had already attained, either were already perfect: but I follow after, if that I may grasp that for which also I am apprehended by Christ Jesus.
- **cadence·ling-3.0-flash**: Not as though I had already attained, either were already perfect: but I follow after, if that I may grasp that for which also I am grasped by Christ Jesus.
- **cadence·glm-5.3**: Not as though I had already attained, either were already perfect: but I follow after, if that I may grasp that for which also I am grasped by Christ Jesus.

### Philippians 3:20

KJV: For our conversation is in heaven; from whence also we look for the Saviour, the Lord Jesus Christ:

- **minimalist·deepseek-v4.1-flash**: For our citizenship is in heaven; from whence also we look for the Saviour, the Lord Jesus Christ:
- **clarity·minimax-m3.1-flash**: For our conversation is in heaven; from where also we look for the Saviour, the Lord Jesus Christ:
- **clarity·ling-3.0-flash**: For our conversation is in heaven; from whence also we look for the Saviour, the Lord Jesus Christ:
- **clarity·glm-5.3**: For our citizenship is in heaven; from whence also we look for the Saviour, the Lord Jesus Christ:
- **cadence·nemotron-3.5-super-vl**: For our conversation is in heaven; from whence also we look for the Saviour, the Lord Jesus Christ:
- **cadence·ling-3.0-flash**: For our conversation is in heaven; from whence also we look for the Saviour, the Lord Jesus Christ:
- **cadence·glm-5.3**: For our citizenship is in heaven; from whence also we look for the Saviour, the Lord Jesus Christ:

### Philippians 4:10

KJV: But I rejoiced in the Lord greatly, that now at the last your care of me hath flourished again; wherein ye were also careful, but ye lacked opportunity.

- **minimalist·deepseek-v4.1-flash**: But I rejoiced in the Lord greatly, that now at the last your care of me has flourished again; wherein you were also anxious, but you lacked opportunity.
- **clarity·minimax-m3.1-flash**: But I rejoiced in the Lord greatly, that now at the last your care of me has flourished again; wherein you were also anxious, but you lacked opportunity.
- **clarity·ling-3.0-flash**: But I rejoiced in the Lord greatly, that now at the last your care of me has flourished again; wherein you were also anxious, but you lacked opportunity.
- **clarity·glm-5.3**: But I rejoiced in the Lord greatly, that now at the last your care of me has flourished again; wherein you were also anxious, but you lacked opportunity.
- **cadence·nemotron-3.5-super-vl**: But I rejoiced in the Lord greatly, that now at the last your care of me has flourished again; wherein you were also anxious, but you lacked opportunity.
- **cadence·ling-3.0-flash**: But I rejoiced in the Lord greatly, that now at the last your care of me has flourished again; wherein you were also anxious, but you lacked opportunity.
- **cadence·glm-5.3**: But I rejoiced in the Lord greatly, that now at the last your care of me has flourished again; wherein you were also anxious, but you lacked opportunity.

## Failures, by passage

- PHP.1.b02 · clarity·llama-3.1-8b-instruct: failed code checks. error: translator-clarity failed (meta-llama/llama-3.1-8b-instruct): OpenRouter: empty response {"id":"gen-1794158189-2QH7XxZQhAUPQYBe9kkq","error":{"message":"Upstream error from Groq: tool call validation failed: attempted to call tool 'original' which was not in request.tools","code":502,"metadata":{"er
- PHP.1.b02 · cadence·llama-3.1-8b-instruct: failed code checks. error: translator-cadence failed (meta-llama/llama-3.1-8b-instruct): OpenRouter: empty response {"id":"gen-1794158193-zbavJ0HMb29Hj2pW22xj","error":{"message":"Upstream error from Groq: Failed to call a function. Please adjust your prompt. See 'failed_generation' for more details.","code":502,"metadata":{"
- PHP.2.b01 · minimalist·deepseek-v4.1-flash: auditor: meaning fail.  "PHP.2.8: 'obedient to death' fails G1 because the extent sense of 'unto' (lexicon G3360) becomes an indirect-object reading. Everything else in the batch is faithful."
- PHP.2.b01 · clarity·minimax-m3.1-flash: auditor: meaning fail. scorer: meaning fail.  "PHP.2.8, c9: the reason itself treats 'death' as 'the dative object after obedient'. That is exactly the misreading: in the KJV, 'unto death' means 'as far as death' (lexicon G3360). G1 fails." "PHP.2.4: on his own things: G1 fail; changing 'look on' to 'look at' can shift the KJV sense from considering or attending to one's own affairs toward visually looking at them (P1, R3)." "PHP.2.4: on the things of others: G1 fail; the parallel preposition change has the same meaning risk (P1, R3)."
- PHP.2.b01 · clarity·ling-3.0-flash: auditor: meaning fail.  "PHP.2.8: 'obedient to death' fails G1. The extent sense of 'unto' (as far as death) becomes a likely indirect-object reading (he obeyed death). Lexicon G3360 puts Php.2:8 under measure or degree."
- PHP.2.b01 · clarity·glm-5.3: auditor: meaning fail. scorer: meaning fail.  "PHP.2.8: 'obedient to death' fails G1, for the same reason as A to C." "PHP.2.4: Look not -> Do not look: G1 fail; 'Do not look every man on his own things' is awkward and does not preserve the idiomatic sense of the KJV construction as clearly as the original (P1, R5)."
- PHP.2.b01 · clarity·llama-3.1-8b-instruct: failed code checks. error: translator-clarity failed (meta-llama/llama-3.1-8b-instruct): OpenRouter: empty response {"id":"gen-1794158309-8ls7P7JlQEFnJbpAknuz","error":{"message":"Upstream error from Groq: tool call validation failed: attempted to call tool 'original' which was not in request.tools","code":502,"metadata":{"er
- PHP.2.b01 · cadence·nemotron-3.5-super-vl: auditor: meaning fail.  "PHP.2.8: 'obedient to death' fails G1 because the extent sense of 'unto' becomes an indirect-object reading (lexicon G3360, Php.2:8 is measure or degree)."
- PHP.2.b01 · cadence·ling-3.0-flash: auditor: meaning fail. scorer: meaning fail.  "PHP.2.6: 'thought it not robbery' was changed to 'thought it not seizure'. 'Seizure' loses the wrongful-taking connotation of 'robbery' and now suggests a medical fit or a legal confiscation. It also settles the active-v" "PHP.2.8: 'obedient to death' fails G1, for the same reason as A to C." "PHP.2.6: robbery -> seizure: G1 fail; the KJV word preserves the ambiguity between a thing seized and a prize or advantage, while 'seizure' may resolve that ambiguity in one direction (P1, R4)."
- PHP.2.b01 · cadence·glm-5.3: auditor: meaning fail.  "PHP.2.8: 'obedient unto death' was changed to 'obedient to death'. In the KJV, 'unto' here marks degree, meaning 'as far as death' (lexicon G3360 lists Php.2:8 under 'measure or degree'). The update reads naturally as an"
- PHP.2.b01 · cadence·llama-3.1-8b-instruct: failed code checks. error: translator-cadence failed (meta-llama/llama-3.1-8b-instruct): OpenRouter: empty response {"id":"gen-1794158309-wbrxXgW9oII95QikfVdy","error":{"message":"Upstream error from Groq: Failed to call a function. Please adjust your prompt. See 'failed_generation' for more details.","code":502,"metadata":{"
- PHP.2.b05 · minimalist·deepseek-v4.1-flash: auditor: meaning fail. scorer: meaning fail. 
- PHP.2.b05 · clarity·ling-3.0-flash: failed code checks. 
- PHP.2.b05 · clarity·glm-5.3: auditor: meaning fail. scorer: meaning fail.  "PHP.2.23: 'presently' kept: R4/P1. In KJV usage 'presently' means 'at once'. At MAT.21.19 it renders παραχρῆμα, and at 1SA.2.16 it stands next to 'now' (L-mw83nwao-3s, L-mw83nz5t-3u). A modern reader takes it as 'soon' o"
- PHP.2.b05 · clarity·llama-3.1-8b-instruct: failed code checks. error: translator-clarity failed (meta-llama/llama-3.1-8b-instruct): OpenRouter: empty response {"id":"gen-1794158457-ox0ZvvoEWqZ5MXl5YTjM","error":{"message":"Upstream error from Groq: tool call validation failed: attempted to call tool 'original' which was not in request.tools","code":502,"metadata":{"er
- PHP.2.b05 · cadence·nemotron-3.5-super-vl: auditor: meaning fail. scorer: meaning fail. 
- PHP.2.b05 · cadence·ling-3.0-flash: auditor: meaning fail. scorer: meaning fail. 
- PHP.2.b05 · cadence·glm-5.3: auditor: meaning fail. scorer: meaning fail. 
- PHP.2.b05 · cadence·llama-3.1-8b-instruct: failed code checks. error: translator-cadence failed (meta-llama/llama-3.1-8b-instruct): OpenRouter: empty response {"id":"gen-1794158499-0snmnqteBki28teHMaLa","error":{"message":"Upstream error from Groq: Failed to call a function. Please adjust your prompt. See 'failed_generation' for more details.","code":502,"metadata":{"
- PHP.2.b06 · minimalist·deepseek-v4.1-flash: auditor: meaning fail. scorer: meaning fail. 
- PHP.2.b06 · clarity·minimax-m3.1-flash: auditor: meaning fail. scorer: meaning fail. 
- PHP.2.b06 · clarity·ling-3.0-flash: auditor: meaning fail. scorer: meaning fail. 
- PHP.2.b06 · clarity·glm-5.3: auditor: meaning fail. 
- PHP.2.b06 · clarity·llama-3.1-8b-instruct: failed code checks. error: translator-clarity failed (meta-llama/llama-3.1-8b-instruct): OpenRouter: empty response {"id":"gen-1794158597-vmqcMdBWkAlR4a0Jx8Pw","error":{"message":"Upstream error from Groq: tool call validation failed: attempted to call tool 'original' which was not in request.tools","code":502,"metadata":{"er
- PHP.2.b06 · cadence·nemotron-3.5-super-vl: auditor: meaning fail.  "PHP.2.30: 'not caring for his life' can be read as 'not tending or nursing his life'. This is a minor ambiguity, not a G1 failure. See the alternative on c8."
- PHP.2.b06 · cadence·ling-3.0-flash: auditor: meaning fail. scorer: meaning fail. 
- PHP.2.b06 · cadence·glm-5.3: auditor: meaning fail. scorer: meaning fail. 
- PHP.2.b06 · cadence·llama-3.1-8b-instruct: failed code checks. error: translator-cadence failed (meta-llama/llama-3.1-8b-instruct): HTTP 400: {"error":{"message":"This endpoint's maximum context length is 131072 tokens. However, you requested about 176091 tokens (164091 of text input, 12000 in the output). Please reduce the length of either one, or use the context-com
- PHP.3.b03 · clarity·llama-3.1-8b-instruct: failed code checks. error: translator-clarity failed (meta-llama/llama-3.1-8b-instruct): OpenRouter: empty response {"id":"gen-1794158900-7CgaGKILGBEGQ4X523X3","error":{"message":"Upstream error from Groq: tool call validation failed: attempted to call tool 'original' which was not in request.tools","code":502,"metadata":{"er
- PHP.3.b03 · cadence·nemotron-3.5-super-vl: auditor: meaning fail.  "PHP.3.12: 'I am apprehended by Christ Jesus': the shifted-meaning word 'apprehended' is kept. With 'by', a modern reader takes it as 'arrested by Christ Jesus'. The KJV means 'laid hold of'. That is a G1 failure (R4, P1)" "PHP.3.12: G5 fails because the passive 'apprehended' is not rendered per provisional entry g-apprehend-grasp, and no amendment is proposed. g-of-by also assumes 'the verb has been modernized', which A did not do." "PHP.3.12: 'apprehended': G5 fails because g-apprehend-grasp expressly covers the passive form and requires 'grasped'; keeping 'apprehended' does not follow that glossary entry."
- PHP.3.b03 · cadence·glm-5.3: auditor: meaning fail. scorer: meaning fail.  "PHP.3.13: 'I count not myself to have apprehended' keeps a shifted-meaning word. A modern reader takes it as 'understood', not 'laid hold of'. That is a G1 failure (R4, P1). It also breaks the repetition of the v12 verb," "PHP.3.13: 'apprehended' does not follow provisional g-apprehend-grasp, and no amendment is proposed, so G5 fails." "PHP.3.13: 'apprehended': G1 fails because retaining this word where a modern reader normally understands 'understood' changes the KJV sense of 'laid hold of' (P1)."
- PHP.3.b03 · cadence·llama-3.1-8b-instruct: failed code checks. error: translator-cadence failed (meta-llama/llama-3.1-8b-instruct): OpenRouter: empty response {"id":"gen-1794158930-GCZPQw1qbD32xTNChHQG","error":{"message":"Upstream error from Groq: tool call validation failed: attempted to call tool 'original' which was not in request.tools","code":502,"metadata":{"er
- PHP.3.b04 · minimalist·deepseek-v4.1-flash: auditor: meaning fail. 
- PHP.3.b04 · clarity·minimax-m3.1-flash: failed code checks. 
- PHP.3.b04 · clarity·ling-3.0-flash: auditor: meaning fail. scorer: meaning fail. 
- PHP.3.b04 · clarity·glm-5.3: auditor: meaning fail. 
- PHP.3.b04 · clarity·llama-3.1-8b-instruct: failed code checks. error: translator-clarity failed (meta-llama/llama-3.1-8b-instruct): OpenRouter: empty response {"id":"gen-1794159098-PuaEe9Dc6CW2QSn2n9oQ","error":{"message":"Upstream error from Groq: tool call validation failed: attempted to call tool 'original' which was not in request.tools","code":502,"metadata":{"er
- PHP.3.b04 · cadence·nemotron-3.5-super-vl: auditor: meaning fail. scorer: meaning fail. 
- PHP.3.b04 · cadence·ling-3.0-flash: auditor: meaning fail. scorer: meaning fail. 
- PHP.3.b04 · cadence·glm-5.3: auditor: meaning fail. 
- PHP.3.b04 · cadence·llama-3.1-8b-instruct: failed code checks. error: translator-cadence failed (meta-llama/llama-3.1-8b-instruct): HTTP 400: {"error":{"message":"This endpoint's maximum context length is 131072 tokens. However, you requested about 181570 tokens (169570 of text input, 12000 in the output). Please reduce the length of either one, or use the context-com
- PHP.4.b03 · minimalist·deepseek-v4.1-flash: auditor: meaning fail.  "PHP.4.12: 'abased' → 'humbled': G1 fail (P1, P5). Here the KJV's 'abased' means being brought low in circumstances, set against 'abound'. Modern 'humbled' points to humility of spirit or to embarrassment, so the connotat"
- PHP.4.b03 · clarity·llama-3.1-8b-instruct: failed code checks. error: translator-clarity failed (meta-llama/llama-3.1-8b-instruct): OpenRouter: empty response {"id":"gen-1794159657-eCPRH2UpOe6b5QnAqbDV","error":{"message":"Upstream error from Groq: tool call validation failed: attempted to call tool 'original' which was not in request.tools","code":502,"metadata":{"er
- PHP.4.b03 · cadence·llama-3.1-8b-instruct: failed code checks. error: translator-cadence failed (meta-llama/llama-3.1-8b-instruct): HTTP 400: {"error":{"message":"This endpoint's maximum context length is 131072 tokens. However, you requested about 158686 tokens (146686 of text input, 12000 in the output). Please reduce the length of either one, or use the context-com
