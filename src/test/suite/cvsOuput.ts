/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Schwartzkers. All rights reserved.
 *  Licensed under the MIT License. See License.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export const cvsUpdate = "\
R INSTALL.md\
U Makefile\
? untrackedFile.log\
? untrackedFolder\
RCS file: /home/user/.cvsroot/schwartzkers/cvs-scm-example/gtest/testFile.cpp,v\
retrieving revision 1.2\
retrieving revision 1.3\
Merging differences between 1.2 and 1.3 into testFile.cpp\
rcsmerge: warning: conflicts during merge\
cvs update: conflicts found in gtest/testFile.cpp\
C gtest/testFile.cpp\
U gtest/reports/report.xml\
cvs update: warning: `interface/subfolder/Ifoo.hpp' was lost\
U interface/subfolder/Ifoo.hpp\
A src/addedFile.cpp\
M src/foo.cpp\
C src/main.cpp\
cvs update: `tree/trunk1.cpp' is no longer in the repository\
cvs update: New directory `tree/folder7-0' -- ignored";

export const cvsStatusMap = new Map();

const installStatus = "\
===================================================================\
File: no file INSTALL.md                Status: Locally Removed\
\
   Working revision:    -1.6    2022-11-02 21:27:32 -0600\
   Repository revision: 1.6     /home/user/.cvsroot/schwartzkers/cvs-scm-example/INSTALL.md,v\
   Commit Identifier:   1006363D078C6AD0190\
   Sticky Tag:          (none)\
   Sticky Date:         (none)\
   Sticky Options:      (none)\
\
";
cvsStatusMap.set('INSTALL.md', installStatus);

const makefileStatus = "\
===================================================================\
File: Makefile          Status: Needs Patch\
\
   Working revision:    1.1     2022-11-03 08:15:12 -0600\
   Repository revision: 1.2     /home/user/.cvsroot/schwartzkers/cvs-scm-example/Makefile,v\
   Commit Identifier:   1006377FE10849CE253\
   Sticky Tag:          (none)\
   Sticky Date:         (none)\
   Sticky Options:      (none)\
\
";
cvsStatusMap.set('Makefile', makefileStatus);

const untrackedFileStatus = "\
cvs status: nothing known about `untrackedFile'\
===================================================================\
File: no file untrackedFile             Status: Unknown\
\
   Working revision:    No entry for untrackedFile\
   Repository revision: No revision control file\
\
";
cvsStatusMap.set('untrackedFile.log', untrackedFileStatus);

cvsStatusMap.set('untrackedFolder', "");

const testFileStatus = "\
===================================================================\
File: testFile.cpp      Status: Needs Merge\
\
   Working revision:    1.2     2022-11-03 08:15:12 -0600\
   Repository revision: 1.3     /home/user/.cvsroot/schwartzkers/cvs-scm-example/gtest/testFile.cpp,v\
   Commit Identifier:   1006377FE10849CE253\
   Sticky Tag:          (none)\
   Sticky Date:         (none)\
   Sticky Options:      (none)\
\
";
cvsStatusMap.set('gtest/testFile.cpp', testFileStatus);

const reportStatus = "\
===================================================================\
File: no file report.xml                Status: Needs Checkout\
\
   Working revision:    No entry for report.xml\
   Repository revision: 1.3     /home/user/.cvsroot/schwartzkers/cvs-scm-example/gtest/reports/report.xml,v\
   Commit Identifier:   1006377FE10849CE253\
\
";
cvsStatusMap.set('gtest/reports/report.xml', reportStatus);

const ifooStatus = "\
===================================================================\
File: no file Ifoo.hpp          Status: Needs Checkout\
\
   Working revision:    1.1     2022-11-08 22:09:19 -0700\
   Repository revision: 1.1     /home/user/.cvsroot/schwartzkers/cvs-scm-example/interface/subfolder/Ifoo.hpp,v\
   Commit Identifier:   1006363372558ABB361\
   Sticky Tag:          HEAD (revision: 1.1)\
   Sticky Date:         (none)\
   Sticky Options:      (none)\
\
";
cvsStatusMap.set('interface/subfolder/Ifoo.hpp', ifooStatus);

const addedFileStatus = "\
===================================================================\
File: addedFile.cpp     Status: Locally Added\
\
   Working revision:    New file!\
   Repository revision: No revision control file\
   Sticky Tag:          (none)\
   Sticky Date:         (none)\
   Sticky Options:      (none)\
\
";
cvsStatusMap.set('src/addedFile.cpp', addedFileStatus);

const fooStatus = "\
===================================================================\
File: foo.cpp           Status: Locally Modified\
\
   Working revision:    1.5     2022-11-08 22:09:19 -0700\
   Repository revision: 1.5     /home/user/.cvsroot/schwartzkers/cvs-scm-example/src/foo.cpp,v\
   Commit Identifier:   10063580CD7CF48A1FE\
   Sticky Tag:          (none)\
   Sticky Date:         (none)\
   Sticky Options:      (none)\
\
";
cvsStatusMap.set('src/foo.cpp', fooStatus);

const mainStatus = "\
===================================================================\
File: main.cpp          Status: Unresolved Conflict\
\
   Working revision:    1.8\
   Repository revision: 1.8     /home/user/.cvsroot/schwartzkers/cvs-scm-example/src/main.cpp,v\
   Commit Identifier:   1006378010E8A045E55\
   Sticky Tag:          (none)\
   Sticky Date:         (none)\
   Sticky Options:      (none)\
\
";
cvsStatusMap.set('src/main.cpp', mainStatus);

const trunk1Status = "\
cvs status: `tree/trunk1.cpp' is no longer in the repository\
===================================================================\
File: trunk1.cpp        Status: Entry Invalid\
\
   Working revision:    1.1     2022-11-08 09:03:45 -0700\
   Repository revision: 1.2     /home/user/.cvsroot/schwartzkers/cvs-scm-example/tree/Attic/trunk1.cpp,v\
   Commit Identifier:   1006377FE10849CE253\
   Sticky Tag:          (none)\
   Sticky Date:         (none)\
   Sticky Options:      (none)\
\
";
cvsStatusMap.set('tree/trunk1.cpp', trunk1Status);

cvsStatusMap.set('tree/folder7-0', "");
