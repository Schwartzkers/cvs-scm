import { Uri } from 'vscode';

export class CmdResult {
    constructor(public result: boolean, public output: string) {
        this.result = result;
        this.output = output;
	}
}

export async function execCmd(cvsCommand: string, dir: string, getStdErr: boolean = false): Promise<CmdResult>  {
    const { exec } = require("child_process");

    let output = "";
    const result = await new Promise<boolean>((resolve) => {
        exec(cvsCommand, {cwd: dir}, (error: any, stdout: string, stderr: string) => {
            if (getStdErr) {
                output = (stdout + stderr);
            } else {
                output = stdout;
            }

            if (error) {
                resolve(false);
            } else {             
                resolve(true);
            }
        });
    });

    return new CmdResult(result, output);
}

export async function spawnCmd(cvsCommand: string, dir: string): Promise<CmdResult>  {
    const { spawn } = require("child_process");

    let stdout = '';
    let stderr = '';
    const result = await new Promise<boolean>((resolve) => {

        const options = {
            cwd: dir,
            shell: true,
            timeout: 5000, // 5 secs
        };
        
        const cmd = spawn(cvsCommand, [""], options);

        cmd.stdout.setEncoding('utf8');
        cmd.stderr.setEncoding('utf8');

        cmd.stdout.on("data", (data: any) => {
            stdout += data;
        });

        cmd.stderr.on("data", (data: any) => {
            console.log(`stderr: ${data}`);
            stderr += data;
        });

        cmd.on('error', (error: any) => {
            console.log(`error: ${error.message}`);
            resolve(false);
        });

        cmd.on("close", (code: any) => {
            console.log(`child process (spawn) exited with code ${code}`);
            resolve(true);
        });
    });

    return new CmdResult(result, stdout);
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