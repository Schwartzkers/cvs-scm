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
