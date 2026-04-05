const ALPHABET = 'FcwAPNKTMug3GV5Lj7EJnHpWsx4tb8haYeviqBz6rkCy12mUSDQX9RdoZf';
const XOR_CODE = 23442827791579n;
const MAX_AID = 1n << 51n;
const MASK_CODE = 2251799813685247n; // (1 << 51) - 1

function swap(bytes: string[], a: number, b: number) {
    const t = bytes[a];
    bytes[a] = bytes[b];
    bytes[b] = t;
}

/**
 * AV ID to BV ID (Universal BVID 2.0)
 * @param aidInput Numeric AV ID or string starting with 'av'
 */
export function avToBv(aidInput: number | string): string {
    const aidStr = typeof aidInput === 'string' ? aidInput.toLowerCase().replace('av', '') : aidInput.toString();
    const aid = BigInt(aidStr);

    const bytes = 'BV1000000000'.split('');
    let bv_idx = 11;
    let tmp = (MAX_AID | aid) ^ XOR_CODE;
    
    while (tmp !== 0n && bv_idx >= 3) {
        bytes[bv_idx] = ALPHABET[Number(tmp % 58n)];
        tmp /= 58n;
        bv_idx--;
    }
    
    swap(bytes, 3, 9);
    swap(bytes, 4, 7);
    
    return bytes.join('');
}

/**
 * BV ID to AV ID (Universal BVID 2.0)
 */
export function bvToAv(bvid: string): string {
    if (!bvid.toLowerCase().startsWith('bv1') || bvid.length < 12) return bvid;

    const bytes = bvid.split('');
    swap(bytes, 3, 9);
    swap(bytes, 4, 7);

    let tmp = 0n;
    for (let i = 3; i < bytes.length; i++) {
        const char = bytes[i];
        const idx = ALPHABET.indexOf(char);
        if (idx !== -1) {
            tmp = tmp * 58n + BigInt(idx);
        }
    }

    const aid = (tmp & MASK_CODE) ^ XOR_CODE;
    return aid.toString();
}
