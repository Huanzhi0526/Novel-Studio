# 本地语义模型与依赖

## 安装位置

`release/NovelStudio-LocalModel-Qwen3-Q8_0.zip` 的根目录包含 `model/`。将 ZIP 解压到工作台资料目录根部，确保得到以下结构，然后重启工作台：

```text
<工作台资料目录>/model/
  Qwen3-Embedding-0.6B-Q8_0.gguf
  LICENSE-QWEN.txt
  LICENSE-LLAMA.txt
  README.txt
  llama-cpp/
    llama-server.exe
    llama-server-impl.dll
    ggml*.dll
    libomp.dll
    LICENSE-LLVM-OpenMP
```

应用自动检测资料目录下的 `model/Qwen3-Embedding-0.6B-Q8_0.gguf` 和 `model/llama-cpp/llama-server.exe`，并将文件路径传给 `EmbeddingProvider`：

```js
new EmbeddingProvider({
  backend: 'llama.cpp',
  modelPath: path.join(dataRoot, 'model', 'Qwen3-Embedding-0.6B-Q8_0.gguf'),
  runtimePath: path.join(dataRoot, 'model', 'llama-cpp', 'llama-server.exe'),
  modelId: 'Qwen3-Embedding-0.6B-Q8_0@ggml-org-b12224',
})
```

工作区探针的资料目录是 `.local/release-model-probe`，同样使用上面的相对路径。模型包不打入工作台安装包；未安装模型时应用应显示关键词检索降级状态。

## 上游文件、许可和校验和

| 内容 | 上游来源 | 许可 | SHA-256 |
| --- | --- | --- | --- |
| Qwen3-Embedding-0.6B Q8_0 GGUF (639,150,592 bytes) | [Qwen 官方模型包](https://huggingface.co/Qwen/Qwen3-Embedding-0.6B-GGUF) · [权重文件](https://huggingface.co/Qwen/Qwen3-Embedding-0.6B-GGUF/resolve/main/Qwen3-Embedding-0.6B-Q8_0.gguf) | [Apache-2.0](https://www.apache.org/licenses/LICENSE-2.0) · [模型卡](https://huggingface.co/Qwen/Qwen3-Embedding-0.6B-GGUF) | `06507c7b42688469c4e7298b0a1e16deff06caf291cf0a5b278c308249c3e439` |
| llama.cpp Windows x64 CPU release b12224 | [官方 release ZIP](https://github.com/ggml-org/llama.cpp/releases/download/b12224/llama-b12224-bin-win-cpu-x64.zip) · [release 页面](https://github.com/ggml-org/llama.cpp/releases/tag/b12224) | [MIT](https://github.com/ggml-org/llama.cpp/blob/b12224/LICENSE) | `d7a7a3e014a02dbfce46977f9da6d9b58196b9c83b80bcf6ef2337134103c3d6` |
| 本包附带的 Qwen Apache-2.0 文本 | Apache Software Foundation | [Apache-2.0](https://www.apache.org/licenses/LICENSE-2.0) | `cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30` |
| 本包附带的 llama.cpp MIT 文本 | ggml-org/llama.cpp b12224 | [MIT 原文](https://github.com/ggml-org/llama.cpp/blob/b12224/LICENSE) | `94f29bbed6a22c35b992c5c6ebf0e7c92f13b836b90f36f461c9cf2f0f1d010d` |

`package-model.mjs` 会先校验权重和 runtime ZIP，再把这两个许可证文件与 runtime 所需 DLL 一起打入外置模型 ZIP。Qwen 权重与 llama.cpp runtime 分别保持原样，不重新量化或重编译。
