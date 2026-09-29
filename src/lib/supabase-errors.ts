type SupabaseErrorLike = {
  code?: string;
  message?: string;
};

export function isMissingRpcError(error: SupabaseErrorLike | null) {
  if (!error) return false;

  return (
    error.code === "PGRST202" ||
    error.message?.toLowerCase().includes("could not find the function") === true
  );
}
