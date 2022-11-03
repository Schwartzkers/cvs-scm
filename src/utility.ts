export class CvsResult {
    constructor(public result: boolean, public output: string) {
        this.result = result;
        this.output = output;
	}
}

export async function runCvsCmd(cvsCommand: string, dir: string, getStdErr: boolean = false): Promise<CvsResult>  {
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

    return new CvsResult(result, output);
}
