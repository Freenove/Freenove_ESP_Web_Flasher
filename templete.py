import os
import json

def main():
    print("请输入（或粘贴）文件夹名称列表（输入 'EOF' 或按 Ctrl+Z/D 结束输入）:")
    
    lines = []
    while True:
        try:
            line = input()
            if line.strip().upper() == 'EOF': # 或者手动输入 EOF 结束
                break
            lines.append(line.strip())
        except EOFError:
            break

    # 过滤掉空行
    names = [l for l in lines if l]

    for name in names:
        if not os.path.exists(name):
            os.makedirs(name)
        
        # 统一的 JSON 模板
        json_content = {
            "version": name,
            "new_install_prompt_erase": True,
            "builds": [
                {
                    "chipFamily": "ESP32-S3",
                    "parts": [{"path": f"{name}.bin", "offset": 0}]
                }
            ]
        }

        with open(os.path.join(name, f"{name}.json"), 'w') as f:
            json.dump(json_content, f, indent=2)
        
        print(f"成功生成: {name}")

if __name__ == "__main__":
    main()