import { type RouterOutputs, api } from "~/utils/api";
import { type PromptVariant, type Scenario } from "../types";
import { Spinner, Text, Box, Center, Flex } from "@chakra-ui/react";
import { useExperiment, useHandledAsyncCallback } from "~/utils/hooks";
import SyntaxHighlighter from "react-syntax-highlighter";
import { docco } from "react-syntax-highlighter/dist/cjs/styles/hljs";
import stringify from "json-stringify-pretty-compact";
import { type ReactElement, useState, useEffect, useRef, useCallback } from "react";
import { type ChatCompletion } from "openai/resources/chat";
import { generateChannel } from "~/utils/generateChannel";
import { isObject } from "lodash";
import useSocket from "~/utils/useSocket";
import { OutputStats } from "./OutputStats";
import { ErrorHandler } from "./ErrorHandler";

export default function OutputCell({
  scenario,
  variant,
}: {
  scenario: Scenario;
  variant: PromptVariant;
}): ReactElement | null {
  const utils = api.useContext();
  const experiment = useExperiment();
  const vars = api.templateVars.list.useQuery({
    experimentId: experiment.data?.id ?? "",
  }).data;

  const scenarioVariables = scenario.variableValues as Record<string, string>;
  const templateHasVariables =
    vars?.length === 0 || vars?.some((v) => scenarioVariables[v.label] !== undefined);

  let disabledReason: string | null = null;

  if (!templateHasVariables) disabledReason = "Add a value to the scenario variables to see output";

  // if (variant.config === null || Object.keys(variant.config).length === 0)
  //   disabledReason = "Save your prompt variant to see output";

  // const model = getModelName(variant.config as JSONSerializable);
  // TODO: Temporarily hardcoding this while we get other stuff working
  const model = "gpt-3.5-turbo";

  const outputMutation = api.outputs.get.useMutation();

  const [output, setOutput] = useState<RouterOutputs["outputs"]["get"]>(null);
  const [channel, setChannel] = useState<string | undefined>(undefined);
  const [numPreviousTries, setNumPreviousTries] = useState(0);

  const fetchMutex = useRef(false);
  const [fetchOutput, fetchingOutput] = useHandledAsyncCallback(
    async (forceRefetch?: boolean) => {
      if (fetchMutex.current) return;
      setNumPreviousTries((prev) => prev + 1);

      fetchMutex.current = true;
      setOutput(null);

      const shouldStream =
        isObject(variant) &&
        "config" in variant &&
        isObject(variant.config) &&
        "stream" in variant.config &&
        variant.config.stream === true;

      const channel = shouldStream ? generateChannel() : undefined;
      setChannel(channel);

      const output = await outputMutation.mutateAsync({
        scenarioId: scenario.id,
        variantId: variant.id,
        channel,
        forceRefetch,
      });
      setOutput(output);
      await utils.promptVariants.stats.invalidate();
      fetchMutex.current = false;
    },
    [outputMutation, scenario.id, variant.id],
  );
  const hardRefetch = useCallback(() => fetchOutput(true), [fetchOutput]);

  useEffect(fetchOutput, [scenario.id, variant.id]);

  // Disconnect from socket if we're not streaming anymore
  const streamedMessage = useSocket(fetchingOutput ? channel : undefined);
  const streamedContent = streamedMessage?.choices?.[0]?.message?.content;

  if (!vars) return null;

  if (disabledReason) return <Text color="gray.500">{disabledReason}</Text>;

  if (fetchingOutput && !streamedMessage)
    return (
      <Center h="100%" w="100%">
        <Spinner />
      </Center>
    );

  if (!output && !fetchingOutput) return <Text color="gray.500">Error retrieving output</Text>;

  if (output && output.errorMessage) {
    return (
      <ErrorHandler
        output={output}
        refetchOutput={hardRefetch}
        numPreviousTries={numPreviousTries}
      />
    );
  }

  const response = output?.output as unknown as ChatCompletion;
  const message = response?.choices?.[0]?.message;

  if (output && message?.function_call) {
    const rawArgs = message.function_call.arguments ?? "null";
    let parsedArgs: string;
    try {
      parsedArgs = JSON.parse(rawArgs);
    } catch (e: any) {
      parsedArgs = `Failed to parse arguments as JSON: '${rawArgs}' ERROR: ${e.message as string}`;
    }

    return (
      <Box fontSize="xs" width="100%" flexWrap="wrap" overflowX="auto">
        <SyntaxHighlighter
          customStyle={{ overflowX: "unset" }}
          language="json"
          style={docco}
          lineProps={{
            style: { wordBreak: "break-all", whiteSpace: "pre-wrap" },
          }}
          wrapLines
        >
          {stringify(
            {
              function: message.function_call.name,
              args: parsedArgs,
            },
            { maxLength: 40 },
          )}
        </SyntaxHighlighter>
        <OutputStats model={model} modelOutput={output} scenario={scenario} />
      </Box>
    );
  }

  const contentToDisplay = message?.content ?? streamedContent ?? JSON.stringify(output?.output);

  return (
    <Flex w="100%" h="100%" direction="column" justifyContent="space-between" whiteSpace="pre-wrap">
      {contentToDisplay}
      {output && <OutputStats model={model} modelOutput={output} scenario={scenario} />}
    </Flex>
  );
}