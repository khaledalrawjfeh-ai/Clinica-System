import re
import os

def extract_function_body(code, func_name):
    # Find the function declaration
    pattern = r"function\s+" + func_name + r"\s*\([^)]*\)\s*\{"
    match = re.search(pattern, code)
    if not match:
        return None, None, None
        
    start_idx = match.start()
    body_start_idx = match.end() - 1 # The opening brace
    
    brace_count = 0
    end_idx = body_start_idx
    for i in range(body_start_idx, len(code)):
        if code[i] == '{':
            brace_count += 1
        elif code[i] == '}':
            brace_count -= 1
            if brace_count == 0:
                end_idx = i + 1
                break
                
    return start_idx, end_idx, code[start_idx:end_idx]

def patch_file():
    app_path = "d:/git__hub/clinica-system/emr-app.js"
    patch_path = "d:/git__hub/clinica-system/معدل2/emr-app-patches.js"
    
    if not os.path.exists(app_path) or not os.path.exists(patch_path):
        print("Files not found")
        return
        
    with open(app_path, 'r', encoding='utf-8') as f:
        code = f.read()
        
    with open(patch_path, 'r', encoding='utf-8') as f:
        patches_code = f.read()
        
    # Extract new functions from patches_code
    _, _, new_initEMR = extract_function_body(patches_code, 'initEMR')
    _, _, new_filter = extract_function_body(patches_code, 'filterPatients')
    _, _, new_render = extract_function_body(patches_code, 'renderPatientsList')
    _, _, new_loadMore = extract_function_body(patches_code, 'loadMorePatients')
    _, _, new_loadMoreServer = extract_function_body(patches_code, 'loadMorePatientsFromServer')
    _, _, new_helper = extract_function_body(patches_code, '_renderLoadMoreButton')
    _, _, new_getPatientSafe = extract_function_body(patches_code, 'getPatientSafe')

    # Replace in code
    start, end, _ = extract_function_body(code, 'initEMR')
    if start: code = code[:start] + new_initEMR + code[end:]
    
    start, end, _ = extract_function_body(code, 'filterPatients')
    if start: code = code[:start] + new_filter + code[end:]
    
    start, end, _ = extract_function_body(code, 'renderPatientsList')
    if start: code = code[:start] + new_render + code[end:]
    
    start, end, _ = extract_function_body(code, 'loadMorePatients')
    if start: code = code[:start] + new_loadMore + "\n\n" + new_loadMoreServer + "\n\n" + new_helper + code[end:]

    # Add globals at top
    if 'let _pager = null;' not in code:
        code = code.replace('let rxItems = [];', 'let rxItems = [];\nlet _pager = null;\nlet _searchDebounceTimer = null;\n')
        
    # Add getPatientSafe if not exists
    if 'function getPatientSafe' not in code:
        code += "\n\n" + new_getPatientSafe + "\n"

    # Save
    with open(app_path, 'w', encoding='utf-8') as f:
        f.write(code)
    print("PATCH SUCCESSFUL")

patch_file()
