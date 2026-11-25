import {
  loadModel,
  translate,
  unloadModel,
  TRANSLATEPSY_AFRISLM_0_8B_TRANSLATION_Q4_K_M,
} from '@qvac/sdk';

try {
  console.log('Loading TranslatePsy English-to-English model...');
  const modelId = await loadModel({
    modelSrc: TRANSLATEPSY_AFRISLM_0_8B_TRANSLATION_Q4_K_M,
    onProgress: (progress) =>
      console.log(`DOWNLOAD ${progress.percentage.toFixed(1)} ${progress.downloaded}/${progress.total}`),
    modelConfig: {
      tools: true,
      ctx_size: 2048,
      top_k: 1,
      top_p: 1,
      temp: 0,
      repeat_penalty: 1,
      seed: 42,
      predict: 256,
      stop_sequences: ['\n'],
    },
  });

  const source = 'Baro sida ChatGPT iyo Claude loogu isticmaalo coding, debugging, frontend iyo backend development.';
  const result = translate({
    modelId,
    text: source,
    from: 'som_Latn',
    to: 'en',
    modelType: 'llamacpp-completion',
    stream: false,
  });

  console.log(`SOURCE: ${source}`);
  console.log(`RESULT: ${await result.text}`);
  await unloadModel({ modelId, clearStorage: false });
} catch (error) {
  console.error(error);
  process.exit(1);
}
