import assert from 'node:assert/strict';
import { formatCardScript } from './formatter';

assert.equal(
	formatCardScript('format_sw=func(sw,prefix="SW="){\nif sw=="9000"{\nreturn { "ok":true,"sw":sw}\n}else{\nreturn {"ok":false}\n}\n}\n\n\n'),
	'format_sw = func(sw, prefix = "SW=") {\n    if sw == "9000" {\n        return {"ok": true, "sw": sw}\n    } else {\n        return {"ok": false}\n    }\n}\n'
);

assert.equal(
	formatCardScript('switch sw{\ncase "9000":{\nprint ( "success",sw )\n}\ndefault:{\nprint("failed")// keep this comment\n}\n}'),
	'switch sw {\ncase "9000": {\n    print("success", sw)\n}\ndefault: {\n    print("failed") // keep this comment\n}\n}'
);

assert.equal(
	formatCardScript('data . parse ( "00" )\r\n', '\r\n'),
	'data.parse("00")\r\n'
);

const longApdu = '00'.repeat(100);
assert.equal(
	formatCardScript(`response = "${longApdu}"\n-> [\n"9000",\n"6A82"\n]\nRST([atr])\n->\n"3B8F8001"`),
	`response = "${longApdu}" -> ["9000", "6A82"]\nRST([atr]) -> "3B8F8001"`
);

const formattedContext = formatCardScript('init_ctx={\n"host_challenge":host_challenge,\n"init_resp":init_resp,\n"div_data":div_data,// Key Diversification Data\n"key_info":init_resp.mid(20,4),// Key Information\n"seq":init_resp.mid(24,4),// SCP02 Sequence Counter\n"card_challenge":init_resp.mid(28,12),// Card Challenge\n"card_cryptogram":init_resp.mid(40,16)// Card Cryptogram\n}');
const commentColumns = formattedContext.split('\n').filter(line => line.includes('//')).map(line => line.indexOf('//'));
assert.equal(new Set(commentColumns).size, 1);

assert.equal(
	formatCardScript('dgi_configs=[\n{"name":"9102","is_encrypto_data":false},\n{"name":"9103","is_encrypto_data":false},\n{"name":"8000","is_encrypto_data":true}\n]'),
	'dgi_configs = [\n    {"name": "9102", "is_encrypto_data": false},\n    {"name": "9103", "is_encrypto_data": false},\n    {"name": "8000", "is_encrypto_data": true}\n]'
);

assert.equal(
	formatCardScript('dgi_9102_data=[{\n"tag":"A5",\n"children":[{\n"tag":"BF0C",\n"children":[{\n"tag":"61",\n"children":[\n{"tag":"4F","value":"A0000000031010"},\n{"tag":"50","value":"564953412044454249544F"},\n{"tag":"87","value":"01"},\n{"tag":"9F12","value":"564953412044454249544F"}\n]\n}]\n}]\n}]'),
	'dgi_9102_data = [{\n    "tag": "A5",\n    "children": [{\n        "tag": "BF0C",\n        "children": [{\n            "tag": "61",\n            "children": [\n                {"tag": "4F", "value": "A0000000031010"},\n                {"tag": "50", "value": "564953412044454249544F"},\n                {"tag": "87", "value": "01"},\n                {"tag": "9F12", "value": "564953412044454249544F"}\n            ]\n        }]\n    }]\n}]'
);

assert.equal(
	formatCardScript('switch diversify {\n\n// CPG202 Diversification\ncase "CPG202": {\nstatic_enc = crypto.cipher("des-ede", "0000", master_key, null, 1)\nbreak\n}\n}'),
	'switch diversify {\n\n// CPG202 Diversification\ncase "CPG202": {\n    static_enc = crypto.cipher("des-ede", "0000", master_key, null, 1)\n    break\n}\n}'
);
