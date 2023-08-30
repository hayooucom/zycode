import os


def replace_vscode(directory):
    for filename in os.listdir(directory):
        filepath = os.path.join(directory, filename)
        try:

            if os.path.isdir(filepath):
                replace_vscode(filepath)  # 递归调用处理子文件夹

            if "vscode" in filename:
                new_filename = filename.replace("vscode", "zycode")
                new_filepath = os.path.join(directory, new_filename)
                try:
                    os.rename(filepath, new_filepath)  # 替换文件名
                except Exception as e:
                    os.remove(filepath)
                

        except Exception as e:
            print(filepath, e)


# 替换当前目录下的文件和文件夹名称
replace_vscode(".")
