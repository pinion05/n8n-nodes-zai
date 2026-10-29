'use strict';

/**
 * Zai LLM — Z.ai GLM API (코딩플랜/일반) 를 pi 없이 직접 호출하는 노드.
 *
 * - 자격증명: httpHeaderAuth 재사용 ("Z.ai Coding API" = Authorization: Bearer <GLM_API_KEY>)
 * - 엔드포인트: 기본 https://api.z.ai/api/coding/paas/v4 (코딩플랜) — 일반 플랜은 /api/paas/v4
 * - 파라미터: model(동적 드롭다운, GET /models) / system / prompt / thinking / temperature / maxTokens
 * - options.concurrency: 아이템 병렬 (기본 1)
 * - 출력: { ok, text, model, usage, finishReason, error } — 실패해도 throw하지 않고 ok:false (클린 실패 패턴)
 */

const CODING_BASE = 'https://api.z.ai/api/coding/paas/v4';
const NORMAL_BASE = 'https://api.z.ai/api/paas/v4';

class ZaiLlm {
	constructor() {
		this.description = {
			displayName: 'LLM API (Z.ai·호환)',
			name: 'zaiLlm',
			icon: 'file:zai.svg',
			group: ['transform'],
			version: 1,
			subtitle: '={{$parameter["model"] || "기본"}}',
			description: 'OpenAI 호환 LLM API 직접 호출 — Z.ai 코딩플랜 / 일반 / 커스텀 baseUrl(freellmapi 등). 도구 없는 순수 LLM 호출',
			defaults: { name: 'Zai LLM' },
			inputs: ['main'],
			outputs: ['main'],
			credentials: [
				{ name: 'httpHeaderAuth', required: true, displayName: 'Z.ai API (Header Auth)' },
			],
			properties: [
				{
					displayName: 'Endpoint',
					name: 'endpoint',
					type: 'options',
					noExpression: true,
					options: [
						{ name: 'Z.ai Coding Plan (api.z.ai/api/coding/paas/v4)', value: 'coding' },
						{ name: 'Z.ai Normal Plan (api.z.ai/api/paas/v4)', value: 'normal' },
						{ name: 'Custom (OpenAI 호환 baseUrl — freellmapi 등)', value: 'custom', description: 'Base URL 직접 지정' },
					],
					default: 'coding',
				},
				{
					displayName: 'Base URL (Custom)',
					name: 'baseUrl',
					type: 'string',
					default: '',
					displayOptions: { show: { endpoint: ['custom'] } },
					placeholder: 'http://127.0.0.1:3001/v1',
					description: 'OpenAI 호환 baseUrl (/chat/completions, /models 가 붙는 경로)',
				},
				{
					displayName: 'Model',
					name: 'model',
					type: 'options',
					typeOptions: { loadOptionsMethod: 'getZaiModels' },
					default: '',
					description: 'GET /models 자동 목록. 비우면 서버 기본. 표현식으로 임의 지정 가능',
				},
				{
					displayName: 'System Prompt',
					name: 'system',
					type: 'string',
					typeOptions: { rows: 3 },
					default: '',
					description: '시스템 메시지 (선택)',
				},
				{
					displayName: 'Prompt',
					name: 'prompt',
					type: 'string',
					typeOptions: { rows: 5 },
					required: true,
					default: '',
					description: '유저 메시지',
				},
				{
					displayName: 'Thinking',
					name: 'thinking',
					type: 'options',
					noExpression: true,
					options: [
						{ name: '(자동 — 파라미터 생략)', value: 'auto' },
						{ name: 'enabled', value: 'enabled' },
						{ name: 'disabled', value: 'disabled' },
					],
					default: 'auto',
					description: 'GLM 추론 모드 (thinking.type)',
				},
				{
					displayName: 'Temperature',
					name: 'temperature',
					type: 'number',
					typeOptions: { numberPrecision: 2 },
					default: 0,
					description: '0 = 전송 안 함(서버 기본). 0.01~2 전송',
				},
				{
					displayName: 'Max Tokens',
					name: 'maxTokens',
					type: 'number',
					typeOptions: { minValue: 1 },
					default: 0,
					description: '0 = 전송 안 함(서버 기본)',
				},
				{
					displayName: 'Timeout (초)',
					name: 'timeoutSec',
					type: 'number',
					default: 120,
				},
				{
					displayName: 'Options',
					name: 'options',
					type: 'collection',
					default: {},
					options: [
						{ displayName: '동시 실행 (아이템 병렬)', name: 'concurrency', type: 'number', default: 1, typeOptions: { minValue: 1, maxValue: 64 }, description: '입력 아이템을 동시 호출 (1=순차)' },
						{ displayName: 'JSON 모드 (response_format)', name: 'jsonMode', type: 'boolean', default: false, description: 'response_format: json_object — 출력 text를 파싱해 객체로 반환' },
					],
				},
			],
		};
	}

	methods = {
		loadOptions: {
			// GET {base}/models → 드롭다운. 자격증명은 노드 컨텍스트에서.
			async getZaiModels() {
				const endpoint = this.getNodeParameter('endpoint', 0);
			let base = endpoint === 'normal' ? NORMAL_BASE : CODING_BASE;
				if (endpoint === 'custom') base = (this.getNodeParameter('baseUrl', 0) || '').replace(/\/$/, '');
				if (!base) return [{ name: '(Custom 선택 시 Base URL을 채워라)', value: '' }];
				try {
					const cred = await this.getCredentials('httpHeaderAuth');
					const res = await this.helpers.httpRequest({
						url: `${base}/models`,
						headers: { Authorization: cred.value },
						json: true,
						timeout: 15000,
					});
					const list = Array.isArray(res) ? res : (res && res.data) || []; // bare array 게이트웨이도 수용
					return list.filter((m) => m && m.id).map((m) => ({ name: `${m.id}`, value: m.id }));
				} catch (e) {
					return [{ name: `(목록 로드 실패 — 표현식으로 지정: ${String(e.message).slice(0, 60)})`, value: '' }];
				}
			},
		},
	};

	async execute() {
		const items = this.getInputData();
		const concurrencyRaw = this.getNodeParameter('options', 0)?.concurrency;
		const concurrency = Math.max(1, Math.min(64, Number(concurrencyRaw) || 1));
		const endpoint = this.getNodeParameter('endpoint', 0);
		let base = endpoint === 'normal' ? NORMAL_BASE : CODING_BASE;
		if (endpoint === 'custom') base = (this.getNodeParameter('baseUrl', 0) || '').replace(/\/$/, '');
		if (!base) throw new Error('Custom 엔드포인트 선택 시 Base URL이 필요하다');
		const cred = await this.getCredentials('httpHeaderAuth');
		const runItem = async (i) => {
			const model = this.getNodeParameter('model', i) || '';
			const system = this.getNodeParameter('system', i) || '';
			const prompt = this.getNodeParameter('prompt', i);
			const thinking = this.getNodeParameter('thinking', i);
			const temperature = Number(this.getNodeParameter('temperature', i)) || 0;
			const maxTokens = Number(this.getNodeParameter('maxTokens', i)) || 0;
			const timeoutSec = Number(this.getNodeParameter('timeoutSec', i)) || 120;
			const jsonMode = this.getNodeParameter('options', i)?.jsonMode || false; // 아이템별 평가 (기존엔 item 0 고정)

			const messages = [];
			if (system) messages.push({ role: 'system', content: system });
			messages.push({ role: 'user', content: String(prompt) });

			const body = { messages, stream: false };
			if (model) body.model = model;
			if (thinking === 'enabled' || thinking === 'disabled') body.thinking = { type: thinking };
			if (temperature > 0) body.temperature = temperature;
			if (maxTokens > 0) body.max_tokens = maxTokens;
			if (jsonMode) body.response_format = { type: 'json_object' };

			const headers = { 'Content-Type': 'application/json' };
			// httpHeaderAuth 값에 Bearer 접두가 없으면 자동 보정 (값만 저장한 자격증명 401 방지)
			headers.Authorization = cred.value && !/^Bearer\s/i.test(String(cred.value)) ? `Bearer ${cred.value}` : cred.value;

			try {
				const res = await this.helpers.httpRequest({
					url: `${base}/chat/completions`,
					method: 'POST',
					headers,
					body,
					json: true,
					timeout: timeoutSec * 1000,
				});
				// 200이지만 choices 없는 에러 바디(게이트웨이 과부하·업스트림 실패)를 ok:true+빈텍스트로 위장하지 않는다
				const choices = Array.isArray(res && res.choices) ? res.choices : null;
				if (!choices || !choices.length) {
					const hint = typeof res === 'string' ? res.slice(0, 200) : JSON.stringify(res)?.slice(0, 300);
					return { json: { ok: false, text: '', model, usage: null, finishReason: null, error: `choices 없는 응답: ${hint}` } };
				}
				const choice = choices[0];
				const msg = choice.message || {};
				let text = msg.content || '';
				const reasoning = msg.reasoning_content || msg.reasoning || null; // thinking 누수 디버깅용 별도 수집
				if (jsonMode) {
					try { text = JSON.parse(text); } catch { /* 원문 유지 */ }
				}
				return { json: { ok: true, text, reasoning, model: res.model || model, usage: res.usage || null, finishReason: choice.finish_reason || null } };
			} catch (e) {
				const detail = e.response ? `${e.response.statusCode || ''} ${String(e.message).slice(0, 200)}` : String(e.message || e).slice(0, 200);
				return { json: { ok: false, text: '', reasoning: null, model, usage: null, finishReason: null, error: detail } };
			}
		};

		if (concurrency > 1 && items.length > 1) {
			const outs = new Array(items.length);
			let next = 0;
			const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
				while (true) {
					const i = next++;
					if (i >= items.length) break;
					outs[i] = await runItem(i);
				}
			});
			await Promise.all(workers);
			return [outs];
		}
		const results = [];
		for (let i = 0; i < items.length; i++) results.push(await runItem(i));
		return [results];
	}
}

module.exports = { ZaiLlm };
