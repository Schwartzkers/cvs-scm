import { Uri, workspace } from 'vscode';
import { cvsCommandLog } from './extension';
import * as iconv from '@vscode/iconv-lite-umd';
import { detectEncoding } from './encoding';

export class CmdResult {
    constructor(public result: boolean, public output: string, public stderr: string = "") {
        this.result = result;
        this.output = output;
        this.stderr = stderr;
	}
}

export async function execCmd(cvsCommand: string, dir: string, getStdErr: boolean = false): Promise<CmdResult>  {
    const { exec } = require("child_process");

    cvsCommandLog.info(cvsCommand);

    let output = "";
    const result = await new Promise<boolean>((resolve) => {
        exec(cvsCommand, {cwd: dir}, (error: any, stdout: string, stderr: string) => {
            cvsCommandLog.debug(stdout);
            cvsCommandLog.debug(stderr);

            if (getStdErr) {
                output = (stdout + stderr);
            } else {
                output = stdout;
            }

            if (error) {
                cvsCommandLog.error(error.message);
                resolve(false);
            } else {
                resolve(true);
            }
        });
    });

    return new CmdResult(result, output);
}

export async function spawnCmd(cvsCommand: string, dir: string, timeoutInSec?: number): Promise<CmdResult>  {
    const { spawn } = require("child_process");

    cvsCommandLog.info(cvsCommand);

    let tOut: number = 5000; // 5 secs
    if (typeof timeoutInSec !== 'undefined') {
        tOut = timeoutInSec * 1000;
    }

    let stdoutBuffers: Buffer[] = [];
    let stderr = '';
    const result = await new Promise<boolean>((resolve) => {

        const options = {
            cwd: dir,
            shell: true,
            timeout: tOut,
            encoding: 'buffer'
        };
        
        const cmd = spawn(cvsCommand, [""], options);

        cmd.stderr.setEncoding('utf8');

        cmd.stdout.on("data", (data: Buffer) => {
            cvsCommandLog.debug(data.toString());
            stdoutBuffers.push(data);
        });

        cmd.stderr.on("data", (data: any) => {
            cvsCommandLog.debug(data);
            stderr += data;
        });

        cmd.on('error', (error: any) => {
            cvsCommandLog.error(error.message);
            resolve(false);
        });

        cmd.on("close", (code: any) => {
            if (code === 0) {
                resolve(true);
            }
            else {
                cvsCommandLog.warn(`cvs command '${cvsCommand}' exited with code ${code}`);
                resolve(false);
            }
        });
    });
    const configFiles = workspace.getConfiguration('files');
	const defaultEncoding = configFiles.get<string>('encoding');
    const autoGuessEncoding = configFiles.get<boolean>('autoGuessEncoding');
    const candidateGuessEncodings = configFiles.get<string[]>('candidateGuessEncodings');

    const stdout = await bufferString(Buffer.concat(stdoutBuffers), defaultEncoding, autoGuessEncoding, candidateGuessEncodings);

    return new CmdResult(result, stdout, stderr);
}

async function bufferString(stdout: Buffer, encoding: string = 'utf8', autoGuessEncoding = false, candidateGuessEncodings: string[] = []): Promise<string> {
    if (autoGuessEncoding) {
        encoding = detectEncoding(stdout, candidateGuessEncodings) || encoding;
    }

    encoding = iconv.encodingExists(encoding) ? encoding : 'utf8';

    return iconv.decode(stdout, encoding);
}

export async function readDir(path: string): Promise<string[]> {
    const fs = require('fs/promises');

    let result = [];

    try {
        result = await fs.readdir(path);
    } catch (err: any) {
        console.log(err);
    }

    return result;
}

export async function  readFile(path: string): Promise<string | undefined> {
    const fs = require('fs/promises');

    try{
        return await fs.readFile(path, {encoding: 'utf-8'});
    } catch(err: any) {
        return undefined;
    }
}

export async function  writeFile(path: string, data: string): Promise<boolean> {
    const fs = require('fs/promises');

    if ((await fs.writeFile(path, data)) === undefined) {
        return true;
    } else {
        return false;
    }
}

export async function  deleteUri(uri: Uri): Promise<boolean>  {
    const fs = require('fs/promises');
    
    let success = false;

    // is it a file or folder?
    const stat = await fs.lstat(uri.fsPath);

    if (stat) {
        if (stat.isFile()) {
            if ((await fs.unlink(uri.fsPath) === undefined)) { success = true; }
        }
        else {
            //TODO Use `fs.rm(path, { recursive: true, force: true })` instead.
            if ((await fs.rmdir(uri.fsPath) === undefined)) { success = true; }
        }
    }

    return success;
}

export async function createDir(uri: Uri): Promise<boolean> {
    const fs = require('fs/promises');

    let result = false;

    if ((await fs.mkdir(uri.fsPath)) === undefined) {
        result = true;
    }

    return result;
}