import { redirect } from "next/navigation";
import { pageUrl } from "@/constants/routeUrl";

export default function Page() {
  redirect(pageUrl.home);
}
