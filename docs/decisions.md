Ignore rules should match at any directory depth (\*\*/...) rather than only project root, so the scanner remains efficient even when scanning a workspace containing multiple projects.

## Case-Insensitive Note Path Matching

CZaza treats file paths as case-insensitive when matching Notes, while displaying the file name using the current real filesystem path.
