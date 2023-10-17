import { useState, useEffect } from "react";
import { Text, VStack, HStack, Tooltip, Box, Icon, GridItem } from "@chakra-ui/react";
import Link from "next/link";
import { BsQuestionCircle } from "react-icons/bs";

import ColoredPercent from "~/components/ColoredPercent";
import { useFineTuneTestingStats, useTestingEntries } from "~/utils/hooks";

const FineTuneHeader = ({ fineTuneId }: { fineTuneId: string }) => {
  const [refetchInterval, setRefetchInterval] = useState(0);
  const stats = useFineTuneTestingStats(fineTuneId, refetchInterval).data;
  const entries = useTestingEntries().data;

  useEffect(() => {
    if (!stats?.countFinished || !entries?.count || stats?.countFinished < entries?.count) {
      setRefetchInterval(5000);
    } else {
      setRefetchInterval(0);
    }
  }, [stats?.countFinished, entries?.count]);

  if (!stats || !entries) return <GridItem />;

  return (
    <VStack alignItems="flex-start">
      <Text
        as={Link}
        href={{ pathname: "/fine-tunes/[id]", query: { id: fineTuneId } }}
        _hover={{ textDecoration: "underline" }}
        fontWeight="bold"
        color="gray.500"
      >
        openpipe:{stats.slug}
      </Text>

      <HStack>
        {stats.averageScore && (
          <>
            <ColoredPercent value={stats.averageScore} />
            <Tooltip
              label={
                <>
                  <Text>
                    % of fields from the ground truth that are exactly matched in the model's
                    output.
                  </Text>
                  <Text>We'll let you customize this calculation in the future.</Text>
                </>
              }
              aria-label="Help about accuracy"
            >
              <Box lineHeight={0}>
                <Icon as={BsQuestionCircle} color="gray.600" boxSize={4} />
              </Box>
            </Tooltip>
          </>
        )}

        {stats.countFinished < entries.count && (
          <Text>
            {stats.countFinished}/{entries.count}
          </Text>
        )}
      </HStack>
    </VStack>
  );
};

export default FineTuneHeader;