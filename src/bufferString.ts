/*---------------------------------------------------------------------------------
 *  The code included in this file is copied from the vscode git extension
 *  Source: https://github.com/microsoft/vscode/blob/a37d32986d9e04a0b001bfe15339b7486a2b6502/extensions/git/src/git.ts#L1242
 *--------------------------------------------------------------------------------
 *  MIT License
 *  
 *  Copyright (c) 2015 - present Microsoft Corporation
 *  
 *  Permission is hereby granted, free of charge, to any person obtaining a copy
 *  of this software and associated documentation files (the "Software"), to deal
 *  in the Software without restriction, including without limitation the rights
 *  to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 *  copies of the Software, and to permit persons to whom the Software is
 *  furnished to do so, subject to the following conditions:
 *  
 *  The above copyright notice and this permission notice shall be included in all
 *  copies or substantial portions of the Software.
 *  
 *  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 *  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 *  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 *  AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 *  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 *  OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 *  SOFTWARE.
 *--------------------------------------------------------------------------------*/

import * as iconv from '@vscode/iconv-lite-umd';
import { detectEncoding } from './encoding';

export async function bufferString(stdout: Buffer, encoding: string = 'utf8', autoGuessEncoding = false, candidateGuessEncodings: string[] = []): Promise<string> {
    if (autoGuessEncoding) {
        encoding = detectEncoding(stdout, candidateGuessEncodings) || encoding;
    }

    encoding = iconv.encodingExists(encoding) ? encoding : 'utf8';

    return iconv.decode(stdout, encoding);
}
